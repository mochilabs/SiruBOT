/**
 * NowPlaying 카드 렌더러(satori) — 고정 컨트롤러 채널의 컨테이너 위에 얹히는 현재 곡 카드예요.
 * 같은 입력(NowPlayingCardInput)으로 skia 렌더러(renderers/nowPlayingCard.ts)를 대신해요.
 *
 * 디자인: 대시보드 토큰(tokens.ts) + 썸네일에서 따온 배경. 썸네일을 160x100 초소형 이미지로 줄여 그 크기에서 블러한 뒤 cover로 카드 전체에 깔아요
 * (카드 크기에서 블러 필터를 걸면 resvg에서 비싸요). 그 위에 대시보드 배경색 스크림을 얹어 글자 대비를 지켜요.
 * 카드는 정적이에요 — 진행바는 넣지 않고 시간은 디스코드 타임스탬프가 맡아요. 높이는 다음 곡 개수에 따라 달라져요.
 */
import { CARD_FONT, createAsyncLru, h, hexToRgba, img, mixHex, RADIUS, stripEmoji, T, W, type SatoriChild, type SatoriElement } from '@sirubot/cards';
import { BOT_NAME } from '@sirubot/utils';
import { formatClock } from '../canvas/shapes.ts';
import type { NowPlayingCardInput } from '../nowPlayingCard.ts';
import { prepareArtwork, type PreparedArtwork } from './artwork.ts';
import { fetchImageDataUri, iconElement, renderSatoriPng } from './satoriKit.ts';

export const NOW_PLAYING_CARD_WIDTH = 960;
const ART = 232;
const PAD = 32;
const NEXT_MAX = 3;

/** 곡 썸네일 처리 결과(다운로드+크롭+배경+대표색)와 신청자 아바타를 URL 단위로 기억해요 — 같은 곡의 상태 변경 재렌더에서 건너뛰어요. */
const loadArtwork = createAsyncLru<PreparedArtwork>(32, async (url) => prepareArtwork(await fetchImageDataUri(url), ART));
const loadAvatar = createAsyncLru<string>(64, (url) => fetchImageDataUri(url));

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

/** 뱃지(`Badge`): 텍스트 색 위에 같은 색 10~20% 배경 */
function badge(label: string, color: string, background: string, icon?: SatoriElement): SatoriElement {
	return h(
		'div',
		{ alignItems: 'center', background, color, borderRadius: 999, padding: '7px 18px', fontSize: 22, fontWeight: W.semibold, marginRight: 10 },
		[icon ?? null, h('div', { marginLeft: icon ? 10 : 0 }, label)]
	);
}

/** 푸터 브랜드 문구 — brandLine에서 이모지(유니코드·커스텀 코드)와 노드·볼륨 토큰을 빼고 봇 이름+버전만 남겨요. 아이콘은 직접 그려요. */
export function brandText(input: Pick<NowPlayingCardInput, 'brandLine' | 'nodeId' | 'volume'>): string {
	let text = stripEmoji((input.brandLine ?? '').replace(/<a?:\w+:\d+>/g, ''));
	if (input.nodeId && text.startsWith(input.nodeId)) text = text.slice(input.nodeId.length).trim();
	if (input.volume !== null && text.startsWith(`${input.volume}%`)) text = text.slice(`${input.volume}%`.length).trim();
	return text || BOT_NAME;
}

function volumeIcon(volume: number | null): 'volume-x' | 'volume-1' | 'volume-2' {
	if (!volume) return 'volume-x';
	return volume < 50 ? 'volume-1' : 'volume-2';
}

export async function renderNowPlayingCardSatori(input: NowPlayingCardInput): Promise<Buffer> {
	// 아트워크·신청자 아바타를 병렬로 받아요. 실패하면 null이라 폴백(단색 자리표시자·배경)으로 그려져요.
	const [artwork, avatarUri] = await Promise.all([
		input.artworkUrl ? loadArtwork(input.artworkUrl) : null,
		input.requester?.avatarUrl ? loadAvatar(input.requester.avatarUrl) : null
	]);
	const accent = artwork?.accent ?? T.brand;
	// 대표색이 어두운 썸네일에서도 글자·아이콘 대비가 나오게, 텍스트용은 흰색을 섞어 밝혀요 (배경 틴트는 원래 대표색).
	const accentText = mixHex(accent, '#ffffff', 0.55);

	// 배경: 썸네일 색 번짐 → 스크림. 썸네일이 없으면 브랜드색을 옅게 깐 단색 그라디언트예요.
	const backdrop: SatoriChild[] = [
		artwork
			? img(artwork.backdrop, { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover' })
			: h('div', {
					position: 'absolute',
					left: 0,
					top: 0,
					width: '100%',
					height: '100%',
					backgroundImage: `linear-gradient(135deg, ${hexToRgba(accent, 0.3)}, ${T.surface1})`
				}),
		h('div', {
			position: 'absolute',
			left: 0,
			top: 0,
			width: '100%',
			height: '100%',
			backgroundImage: `linear-gradient(180deg, ${hexToRgba(T.background, 0.6)} 0%, ${hexToRgba(T.background, 0.86)} 100%)`
		})
	];

	// 상단 뱃지: 재생 상태 + 상태 텍스트(LIVE · 봇 추천 · 반복)
	const statusBadge = input.isPaused
		? badge('일시정지', T.foreground, 'rgba(255, 255, 255, 0.12)', iconElement('pause', 22, T.foreground))
		: badge('재생 중', accentText, hexToRgba(accent, 0.28), h('div', { width: 10, height: 10, borderRadius: 5, background: accentText }));
	const badges: SatoriElement[] = [statusBadge];
	if (input.isStream) badges.push(badge('LIVE', T.destructive, hexToRgba(T.destructive, 0.18)));
	if (input.isRecommended) badges.push(badge('봇 추천', T.mutedForeground, 'rgba(255, 255, 255, 0.1)'));
	if (input.repeatMode === 'track')
		badges.push(badge('반복: 현재 곡', T.mutedForeground, 'rgba(255, 255, 255, 0.1)', iconElement('repeat-1', 22, T.mutedForeground)));
	else if (input.repeatMode === 'queue')
		badges.push(badge('반복: 대기열', T.mutedForeground, 'rgba(255, 255, 255, 0.1)', iconElement('repeat', 22, T.mutedForeground)));

	const requester = input.requester
		? h(
				'div',
				{
					alignItems: 'center',
					background: 'rgba(0, 0, 0, 0.3)',
					borderRadius: 999,
					padding: '6px 18px 6px 6px',
					marginLeft: 12,
					flexShrink: 0,
					maxWidth: 230
				},
				[
					avatarUri
						? img(avatarUri, { width: 40, height: 40, borderRadius: 20 })
						: h('div', { width: 40, height: 40, borderRadius: 20, background: hexToRgba(accent, 0.4) }),
					h(
						'div',
						{ fontSize: 24, fontWeight: W.semibold, color: T.foreground, marginLeft: 12, ...ellipsis },
						stripEmoji(input.requester.name)
					)
				]
			)
		: null;

	const title = stripEmoji(input.title) || '제목 없음';
	const artist = stripEmoji(input.artist);
	const chapter = input.chapter
		? h(
				'div',
				{
					alignItems: 'center',
					alignSelf: 'flex-start',
					maxWidth: '100%',
					background: 'rgba(0, 0, 0, 0.28)',
					borderRadius: RADIUS.controlInner,
					padding: '7px 16px',
					marginTop: 14
				},
				[
					iconElement('corner-down-right', 24, accentText),
					h(
						'div',
						{ fontSize: 24, fontWeight: W.semibold, color: T.foreground, marginLeft: 10, ...ellipsis },
						`${stripEmoji(input.chapter.name)} (${formatClock(input.chapter.startMs)} - ${formatClock(input.chapter.endMs)})`
					)
				]
			)
		: null;

	const art = artwork
		? img(artwork.art, { width: ART, height: ART, borderRadius: RADIUS.control, flexShrink: 0 })
		: h('div', { width: ART, height: ART, borderRadius: RADIUS.control, background: T.surface2, flexShrink: 0 });

	const top = h('div', { alignItems: 'flex-start' }, [
		art,
		h('div', { flexDirection: 'column', flex: 1, minWidth: 0, minHeight: ART, marginLeft: 28 }, [
			h('div', { alignItems: 'center', justifyContent: 'space-between' }, [h('div', { flex: 1, minWidth: 0 }, badges), requester]),
			h(
				'div',
				{ fontSize: 44, fontWeight: W.black, letterSpacing: '-0.03em', lineHeight: 1.18, color: T.foreground, marginTop: 14, lineClamp: 2 },
				title
			),
			artist ? h('div', { fontSize: 28, color: T.mutedForeground, marginTop: 6, ...ellipsis }, artist) : null,
			chapter
		])
	]);

	// 다음 곡 (대시보드 목록 행 — surface-2, rounded-control)
	const next = (input.nextTracks ?? []).slice(0, NEXT_MAX);
	const nextList =
		next.length > 0
			? h('div', { flexDirection: 'column', marginTop: 24 }, [
					h('div', { fontSize: 22, fontWeight: W.semibold, color: T.mutedForeground, marginBottom: 10 }, '다음 곡'),
					...next.map((track, i) =>
						h(
							'div',
							{
								alignItems: 'center',
								background: hexToRgba(T.surface2, 0.72),
								borderRadius: RADIUS.control,
								padding: '12px 20px',
								marginTop: i === 0 ? 0 : 8
							},
							[
								h('div', { width: 36, fontSize: 24, fontWeight: W.black, color: accentText }, String(i + 1)),
								h(
									'div',
									{ flex: 1, minWidth: 0, fontSize: 26, fontWeight: W.semibold, color: T.foreground, ...ellipsis },
									stripEmoji(track.title)
								),
								track.artist
									? h(
											'div',
											{ maxWidth: 260, marginLeft: 16, fontSize: 22, color: T.mutedForeground, ...ellipsis },
											stripEmoji(track.artist)
										)
									: null
							]
						)
					)
				])
			: null;

	// 푸터: 노드·볼륨 아이콘 + 봇 이름/버전, 오른쪽에 대기열 메타
	const queueMeta =
		input.queueCount > 0
			? `대기열 ${input.queueCount}곡${input.queueRemainingMs > 0 ? ` (${Math.floor(input.queueRemainingMs / 60000)}분 남음)` : ''}`
			: null;
	const footerItem = (children: SatoriChild[]) => h('div', { alignItems: 'center', marginRight: 22 }, children);
	const footer = h('div', { alignItems: 'center', justifyContent: 'space-between', marginTop: 24, fontSize: 21, color: T.mutedForeground }, [
		h('div', { alignItems: 'center', flex: 1, minWidth: 0 }, [
			input.nodeId ? footerItem([iconElement('radio', 22, T.mutedForeground), h('div', { marginLeft: 8 }, input.nodeId)]) : null,
			input.volume !== null
				? footerItem([iconElement(volumeIcon(input.volume), 22, T.mutedForeground), h('div', { marginLeft: 8 }, `${input.volume}%`)])
				: null,
			h('div', { ...ellipsis, minWidth: 0, flex: 1 }, brandText(input))
		]),
		queueMeta ? h('div', { marginLeft: 16, flexShrink: 0 }, queueMeta) : null
	]);

	const root = h(
		'div',
		{
			width: NOW_PLAYING_CARD_WIDTH,
			boxSizing: 'border-box',
			position: 'relative',
			flexDirection: 'column',
			// 컨테이너 위에서 둥근 패널로 보이게 모서리를 잘라요 (바깥은 투명)
			borderRadius: RADIUS.card,
			overflow: 'hidden',
			background: T.surface1,
			padding: PAD,
			fontFamily: CARD_FONT
		},
		[
			...backdrop,
			// 배경은 absolute라 일반 흐름 콘텐츠보다 위에 그려져요 — 콘텐츠도 relative로 올려서 DOM 순서대로 쌓아요.
			h('div', { position: 'relative', flexDirection: 'column' }, [top, nextList, footer])
		]
	);
	return renderSatoriPng(root, { width: NOW_PLAYING_CARD_WIDTH });
}
