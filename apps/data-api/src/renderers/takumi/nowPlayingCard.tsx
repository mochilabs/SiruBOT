/**
 * NowPlaying 카드 렌더러(Takumi) — 고정 컨트롤러 채널의 컨테이너 위에 얹히는 현재 곡 카드예요.
 *
 * 디자인: 대시보드 토큰(tokens.ts) + 썸네일에서 따온 배경. 썸네일을 160x100 초소형 이미지로 줄여 그 크기에서 블러한 뒤 cover로 카드 전체에 깔아요
 * (카드 크기에서 블러 필터를 걸면 비싸요). 그 위에 대시보드 배경색 스크림을 얹어 글자 대비를 지켜요.
 * 카드는 정적이에요 — 진행바는 넣지 않고 시간은 디스코드 타임스탬프가 맡아요. 높이는 다음 곡 개수에 따라 달라져요.
 */
import type { CSSProperties, ReactNode } from 'react';
import { CARD_FONT, createAsyncLru, hexToRgba, mixHex, RADIUS, stripEmoji, T, W } from '@sirubot/cards';
import { BOT_NAME } from '@sirubot/utils';
import { formatClock } from './format.ts';
import { prepareArtwork, type PreparedArtwork } from './artwork.ts';
import type { IconName } from './icons.ts';
import { Box, fetchImageDataUri, Icon, renderCardPng } from './takumiKit.tsx';

export interface NowPlayingCardInput {
	/** 캐시/dedup 키 — lavalink track.info.identifier */
	trackId: string;
	title: string;
	/** 아티스트 — 제목 아래 표기해요 */
	artist: string;
	/** 아트워크 URL — data-api가 fetch해요. 실패하면 폴백 아트워크를 그려요 */
	artworkUrl: string | null;
	/** 재생 위치(ms) — 이미지에는 표시하지 않고 스키마 호환용으로 유지해요 */
	positionMs: number;
	/** 전체 길이(ms) — 스트림·챕터 여부 판별용 */
	durationMs: number;
	isStream: boolean;
	/** 일시정지 상태 — 일시정지 뱃지를 박아요 */
	isPaused?: boolean;
	/** 반복 모드 — off가 아니면 상단에 반복 뱃지로 표기해요 */
	repeatMode?: 'off' | 'track' | 'queue';
	/** 현재 곡이 추천 곡(related) 곡인지 — 추천 곡 뱃지를 박아요 */
	isRecommended?: boolean;
	/** 다음 곡 목록(유저 대기열 기준) — 공간이 허용되는 만큼(최대 3) 그려요 */
	nextTracks?: Array<{ title: string; artist: string | null }>;
	/** 하단 메타 — 카드에 박아요 */
	queueCount: number;
	/** 대기열 전체 남은 시간(ms) — 0이면 미표기 */
	queueRemainingMs: number;
	/** 볼륨(%) — 브랜드줄(brandLine)에 통합되어 렌더러에서는 미사용 (스키마/타입 호환용으로 유지) */
	volume: number | null;
	/** 노드 ID — 브랜드줄(brandLine)에 통합되어 렌더러에서는 미사용 (스키마/타입 호환용으로 유지) */
	nodeId: string | null;
	/** 브랜드 줄 (노드·볼륨·봇 이름 + 버전/해시) */
	brandLine: string | null;
	/** 현재 재생 중인 챕터 — 있으면 제목 아래에 구간을 표시해요 */
	chapter: { name: string; startMs: number; endMs: number } | null;
	/** 신청자 — 있으면 카드에 아바타 + 이름을 박아요 (상단 우측) */
	requester: { name: string; avatarUrl: string | null } | null;
	/** 곡 원본 URL — 이미지에는 클릭 불가라 표기하지 않고 스키마 호환용으로 유지해요 */
	trackUrl?: string | null;
}

export const NOW_PLAYING_CARD_WIDTH = 960;
const ART = 232;
const PAD = 32;
const NEXT_MAX = 3;

/** 곡 썸네일 처리 결과(다운로드+크롭+배경+대표색)와 신청자 아바타를 URL 단위로 기억해요 — 같은 곡의 상태 변경 재렌더에서 건너뛰어요. */
const loadArtwork = createAsyncLru<PreparedArtwork>(32, async (url) => prepareArtwork(await fetchImageDataUri(url), ART));
const loadAvatar = createAsyncLru<string>(64, (url) => fetchImageDataUri(url));

const ellipsis = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const satisfies CSSProperties;
const fill = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' } as const satisfies CSSProperties;

/** 뱃지(`Badge`): 텍스트 색 위에 같은 색 10~20% 배경 */
function Badge({ label, color, background, icon }: { label: string; color: string; background: string; icon?: ReactNode }): ReactNode {
	return (
		<Box
			style={{
				alignItems: 'center',
				background,
				color,
				borderRadius: 999,
				padding: '7px 18px',
				fontSize: 22,
				fontWeight: W.semibold,
				marginRight: 10
			}}
		>
			{icon}
			<Box style={{ marginLeft: icon ? 10 : 0 }}>{label}</Box>
		</Box>
	);
}

/** 푸터 브랜드 문구 — brandLine에서 이모지(유니코드·커스텀 코드)와 노드·볼륨 토큰을 빼고 봇 이름+버전만 남겨요. 아이콘은 직접 그려요. */
export function brandText(input: Pick<NowPlayingCardInput, 'brandLine' | 'nodeId' | 'volume'>): string {
	let text = stripEmoji((input.brandLine ?? '').replace(/<a?:\w+:\d+>/g, ''));
	if (input.nodeId && text.startsWith(input.nodeId)) text = text.slice(input.nodeId.length).trim();
	if (input.volume !== null && text.startsWith(`${input.volume}%`)) text = text.slice(`${input.volume}%`.length).trim();
	return text || BOT_NAME;
}

function volumeIcon(volume: number | null): IconName {
	if (!volume) return 'volume-x';
	return volume < 50 ? 'volume-1' : 'volume-2';
}

export async function renderNowPlayingCard(input: NowPlayingCardInput): Promise<Buffer> {
	// 아트워크·신청자 아바타를 병렬로 받아요. 실패하면 null이라 폴백(단색 자리표시자·배경)으로 그려져요.
	const [artwork, avatarUri] = await Promise.all([
		input.artworkUrl ? loadArtwork(input.artworkUrl) : null,
		input.requester?.avatarUrl ? loadAvatar(input.requester.avatarUrl) : null
	]);
	const accent = artwork?.accent ?? T.brand;
	// 대표색이 어두운 썸네일에서도 글자·아이콘 대비가 나오게, 텍스트용은 흰색을 섞어 밝혀요 (배경 틴트는 원래 대표색).
	const accentText = mixHex(accent, '#ffffff', 0.55);
	const mutedBadgeBg = 'rgba(255, 255, 255, 0.1)';

	const next = (input.nextTracks ?? []).slice(0, NEXT_MAX);
	const title = stripEmoji(input.title) || '제목 없음';
	const artist = stripEmoji(input.artist);
	const queueMeta =
		input.queueCount > 0
			? `대기열 ${input.queueCount}곡${input.queueRemainingMs > 0 ? ` (${Math.floor(input.queueRemainingMs / 60000)}분 남음)` : ''}`
			: null;

	const card = (
		<Box
			style={{
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
			}}
		>
			{/* 배경: 썸네일 색 번짐 → 스크림. 썸네일이 없으면 브랜드색을 옅게 깐 단색 그라디언트예요. */}
			{artwork ? (
				<img src={artwork.backdrop} style={{ ...fill, objectFit: 'cover' }} />
			) : (
				<Box style={{ ...fill, backgroundImage: `linear-gradient(135deg, ${hexToRgba(accent, 0.3)}, ${T.surface1})` }} />
			)}
			<Box
				style={{
					...fill,
					backgroundImage: `linear-gradient(180deg, ${hexToRgba(T.background, 0.6)} 0%, ${hexToRgba(T.background, 0.86)} 100%)`
				}}
			/>
			{/* 배경은 absolute라 일반 흐름 콘텐츠보다 위에 그려져요 — 콘텐츠도 relative로 올려서 DOM 순서대로 쌓아요. */}
			<Box style={{ position: 'relative', flexDirection: 'column' }}>
				<Box style={{ alignItems: 'flex-start' }}>
					{artwork ? (
						<img src={artwork.art} style={{ width: ART, height: ART, borderRadius: RADIUS.control, flexShrink: 0 }} />
					) : (
						<Box style={{ width: ART, height: ART, borderRadius: RADIUS.control, background: T.surface2, flexShrink: 0 }} />
					)}
					<Box style={{ flexDirection: 'column', flex: 1, minWidth: 0, minHeight: ART, marginLeft: 28 }}>
						<Box style={{ alignItems: 'center', justifyContent: 'space-between' }}>
							{/* 상단 뱃지: 재생 상태 + 상태 텍스트(LIVE · 추천 곡 · 반복) */}
							<Box style={{ flex: 1, minWidth: 0 }}>
								{input.isPaused ? (
									<Badge
										label="일시정지"
										color={T.foreground}
										background="rgba(255, 255, 255, 0.12)"
										icon={<Icon name="pause" size={22} color={T.foreground} />}
									/>
								) : (
									<Badge
										label="재생 중"
										color={accentText}
										background={hexToRgba(accent, 0.28)}
										icon={<Box style={{ width: 10, height: 10, borderRadius: 5, background: accentText }} />}
									/>
								)}
								{input.isStream ? <Badge label="LIVE" color={T.destructive} background={hexToRgba(T.destructive, 0.18)} /> : null}
								{input.isRecommended ? <Badge label="추천 곡" color={T.mutedForeground} background={mutedBadgeBg} /> : null}
								{input.repeatMode === 'track' ? (
									<Badge
										label="반복: 현재 곡"
										color={T.mutedForeground}
										background={mutedBadgeBg}
										icon={<Icon name="repeat-1" size={22} color={T.mutedForeground} />}
									/>
								) : null}
								{input.repeatMode === 'queue' ? (
									<Badge
										label="반복: 대기열"
										color={T.mutedForeground}
										background={mutedBadgeBg}
										icon={<Icon name="repeat" size={22} color={T.mutedForeground} />}
									/>
								) : null}
							</Box>
							{input.requester ? (
								<Box
									style={{
										alignItems: 'center',
										background: 'rgba(0, 0, 0, 0.3)',
										borderRadius: 999,
										padding: '6px 18px 6px 6px',
										marginLeft: 12,
										flexShrink: 0,
										maxWidth: 230
									}}
								>
									{avatarUri ? (
										<img src={avatarUri} style={{ width: 40, height: 40, borderRadius: 20 }} />
									) : (
										<Box style={{ width: 40, height: 40, borderRadius: 20, background: hexToRgba(accent, 0.4) }} />
									)}
									<Box style={{ fontSize: 24, fontWeight: W.semibold, color: T.foreground, marginLeft: 12, ...ellipsis }}>
										{stripEmoji(input.requester.name)}
									</Box>
								</Box>
							) : null}
						</Box>
						<Box
							style={{
								fontSize: 44,
								fontWeight: W.black,
								letterSpacing: '-0.03em',
								lineHeight: 1.18,
								color: T.foreground,
								marginTop: 14,
								lineClamp: 2
							}}
						>
							{title}
						</Box>
						{artist ? <Box style={{ fontSize: 28, color: T.mutedForeground, marginTop: 6, ...ellipsis }}>{artist}</Box> : null}
						{input.chapter ? (
							<Box
								style={{
									alignItems: 'center',
									alignSelf: 'flex-start',
									maxWidth: '100%',
									background: 'rgba(0, 0, 0, 0.28)',
									borderRadius: RADIUS.controlInner,
									padding: '7px 16px',
									marginTop: 14
								}}
							>
								<Icon name="corner-down-right" size={24} color={accentText} />
								<Box style={{ fontSize: 24, fontWeight: W.semibold, color: T.foreground, marginLeft: 10, ...ellipsis }}>
									{`${stripEmoji(input.chapter.name)} (${formatClock(input.chapter.startMs)} - ${formatClock(input.chapter.endMs)})`}
								</Box>
							</Box>
						) : null}
					</Box>
				</Box>

				{/* 다음 곡 (대시보드 목록 행 — surface-2, rounded-control) */}
				{next.length > 0 ? (
					<Box style={{ flexDirection: 'column', marginTop: 24 }}>
						<Box style={{ fontSize: 22, fontWeight: W.semibold, color: T.mutedForeground, marginBottom: 10 }}>다음 곡</Box>
						{next.map((track, i) => (
							<Box
								key={i}
								style={{
									alignItems: 'center',
									background: hexToRgba(T.surface2, 0.72),
									borderRadius: RADIUS.control,
									padding: '12px 20px',
									marginTop: i === 0 ? 0 : 8
								}}
							>
								<Box style={{ width: 36, fontSize: 24, fontWeight: W.black, color: accentText }}>{String(i + 1)}</Box>
								<Box style={{ flex: 1, minWidth: 0, fontSize: 26, fontWeight: W.semibold, color: T.foreground, ...ellipsis }}>
									{stripEmoji(track.title)}
								</Box>
								{track.artist ? (
									<Box style={{ maxWidth: 260, marginLeft: 16, fontSize: 22, color: T.mutedForeground, ...ellipsis }}>
										{stripEmoji(track.artist)}
									</Box>
								) : null}
							</Box>
						))}
					</Box>
				) : null}

				{/* 푸터: 노드·볼륨 아이콘 + 봇 이름/버전, 오른쪽에 대기열 메타 */}
				<Box style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: 24, fontSize: 21, color: T.mutedForeground }}>
					<Box style={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
						{input.nodeId ? (
							<Box style={{ alignItems: 'center', marginRight: 22 }}>
								<Icon name="radio" size={22} color={T.mutedForeground} />
								<Box style={{ marginLeft: 8 }}>{input.nodeId}</Box>
							</Box>
						) : null}
						{input.volume !== null ? (
							<Box style={{ alignItems: 'center', marginRight: 22 }}>
								<Icon name={volumeIcon(input.volume)} size={22} color={T.mutedForeground} />
								<Box style={{ marginLeft: 8 }}>{`${input.volume}%`}</Box>
							</Box>
						) : null}
						<Box style={{ ...ellipsis, minWidth: 0, flex: 1 }}>{brandText(input)}</Box>
					</Box>
					{queueMeta ? <Box style={{ marginLeft: 16, flexShrink: 0 }}>{queueMeta}</Box> : null}
				</Box>
			</Box>
		</Box>
	);
	return renderCardPng(card, { width: NOW_PLAYING_CARD_WIDTH });
}
