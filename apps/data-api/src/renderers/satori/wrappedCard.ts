/**
 * Wrapped 카드 렌더러 — satori로 개인 음악 요약을 900x1700 세로 PNG로 그려요 (스크린샷 공유용 비율).
 *
 * 디자인은 대시보드(apps/dashboard/DESIGN.md)의 다크 테마 토큰을 그대로 옮겼어요. 카드는 2배 스케일이에요
 * (rounded-card 1rem → 32, rounded-control 0.625rem → 20, p-5 → 40). 새 색을 만들지 말고 아래 토큰에서 골라요.
 * 레이아웃은 flex 선언만 쓰고, 좌표 계산은 하지 않아요.
 */
import type { WrappedRanking, WrappedStats } from '../../services/wrapped.ts';
import { RADIUS, T, W } from './tokens.ts';
import { CARD_FONT, fetchImageDataUri, h, img, renderSatoriPng, stripEmoji, type SatoriChild, type SatoriElement } from './satoriKit.ts';

export const WRAPPED_CARD_SIZE = { width: 900, height: 1700 } as const;
/** 기록이 없을 때는 안내 카드 하나뿐이라 짧게 그려요. */
const WRAPPED_EMPTY_SIZE = { width: 900, height: 470 } as const;

export interface WrappedCardInput {
	displayName: string;
	avatarUrl: string | null;
	/** "최근 30일" 같은 기간 표기 */
	periodLabel: string;
	/** "이 서버" / "모든 서버" */
	scopeLabel: string;
	stats: WrappedStats;
}

/**
 * 카드 그림자(Elev-1)는 그리지 않아요 — 다크 배경에서 거의 안 보이는 값인데, satori가 블러 필터로 내보내서
 * resvg 래스터 시간의 약 70%(카드 7개에 약 115ms)를 먹어요. 깊이는 surface 톤 차이로 충분해요.
 * 같은 이유로 inset 그림자(control-boundary) 대신 border를 써요.
 */

const number = (n: number): string => n.toLocaleString('ko-KR');

/** 분을 "N시간 M분" / "M분"으로. */
export function formatMinutes(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return `${rest}분`;
	return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

/** 시간대를 "오후 9시"처럼 읽어요. */
export function formatHour(hour: number): string {
	const period = hour < 12 ? '오전' : '오후';
	const h12 = hour % 12 === 0 ? 12 : hour % 12;
	return `${period} ${h12}시`;
}

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

/** `Card`: borderless rounded-card bg-card shadow-sm p-5 */
function card(children: SatoriChild[], style: Record<string, string | number> = {}): SatoriElement {
	return h(
		'div',
		{
			flexDirection: 'column',
			background: T.surface1,
			borderRadius: RADIUS.card,
			padding: 32,
			...style
		},
		children
	);
}

/** `SectionLabel` 자리 — 카드 맨 위의 작은 회색 라벨 */
function sectionLabel(text: string): SatoriElement {
	return h('div', { fontSize: 22, fontWeight: W.semibold, color: T.mutedForeground }, text);
}

/** 썸네일 — 없으면 자리표시자. 놓이는 면(onSurface)과 다른 표면 색으로 칠해야 보여요. */
function cover(src: string | null, size: number, radius: number, onSurface: 'surface1' | 'surface2' = 'surface1'): SatoriElement {
	if (src) return img(src, { width: size, height: size, borderRadius: radius, objectFit: 'cover' });
	return h('div', { width: size, height: size, borderRadius: radius, background: onSurface === 'surface1' ? T.surface2 : T.surface1 });
}

/** `StatCard`: bg-surface-2 rounded-control 안의 라벨 + font-black 숫자 */
function statCell(label: string, value: string): SatoriElement {
	return h('div', { flexDirection: 'column', flex: 1, minWidth: 0, background: T.surface2, borderRadius: RADIUS.control, padding: '20px 24px' }, [
		h('div', { fontSize: 22, fontWeight: W.semibold, color: T.mutedForeground }, label),
		h('div', { fontSize: 40, fontWeight: W.black, color: T.primaryText, marginTop: 6, ...ellipsis }, value)
	]);
}

/** "상위 N%" 알약(`button-cta` 색) + 풀 크기와 순위 캡션 — 합계 카드 오른쪽에 둬요. */
function rankBadge(ranking: WrappedRanking, scopeLabel: string): SatoriElement {
	return h('div', { flexDirection: 'column', alignItems: 'flex-end' }, [
		h(
			'div',
			{ background: T.brand, color: T.brandForeground, borderRadius: 999, padding: '8px 26px', fontSize: 34, fontWeight: W.black },
			`상위 ${ranking.topPercent}%`
		),
		h('div', { fontSize: 20, color: T.mutedForeground, marginTop: 8 }, `${scopeLabel} ${number(ranking.pool)}명 중 ${number(ranking.rank)}위`)
	]);
}

const HOUR_BAR_MAX = 120;

/** 24시간 막대 — 피크 시간만 brand, 나머지는 border-strong */
function hourBars(counts: readonly number[], peakHour: number | null): SatoriElement {
	const max = Math.max(1, ...counts);
	return h(
		'div',
		{ alignItems: 'flex-end', justifyContent: 'space-between', height: HOUR_BAR_MAX, width: '100%' },
		counts.map((count, hour) =>
			h('div', {
				width: 24,
				height: Math.max(4, Math.round((count / max) * HOUR_BAR_MAX)),
				borderRadius: 6,
				background: hour === peakHour ? T.brand : T.borderStrong,
				opacity: hour === peakHour ? 1 : 0.6
			})
		)
	);
}

export async function renderWrappedCard(input: WrappedCardInput): Promise<Buffer> {
	const { stats } = input;
	const featured = stats.topTracks[0];
	const rest = stats.topTracks.slice(1, 5);
	// 썸네일과 아바타를 병렬로 받아요 — 실패한 이미지는 null이라 surface-2 자리표시자로 그려져요.
	const [avatar, ...thumbs] = await Promise.all([
		fetchImageDataUri(input.avatarUrl),
		...stats.topTracks.slice(0, 5).map((track) => fetchImageDataUri(track.thumbnail))
	]);

	// `PageHeader`: 제목 font-black tracking-tighter, 설명 muted
	const header = h('div', { alignItems: 'center' }, [
		avatar
			? img(avatar, { width: 88, height: 88, borderRadius: 44 })
			: h('div', { width: 88, height: 88, borderRadius: 44, background: T.surface2 }),
		h('div', { flexDirection: 'column', marginLeft: 24, flex: 1, minWidth: 0 }, [
			h(
				'div',
				{ fontSize: 48, fontWeight: W.black, letterSpacing: '-0.05em', color: T.foreground, ...ellipsis },
				stripEmoji(input.displayName) || '이름 없음'
			),
			h('div', { fontSize: 24, color: T.mutedForeground, marginTop: 4 }, `시루봇 결산 · ${input.periodLabel} · ${input.scopeLabel}`)
		])
	]);

	const isEmpty = stats.totalPlays === 0 || !featured;
	const size = isEmpty ? WRAPPED_EMPTY_SIZE : WRAPPED_CARD_SIZE;

	let body: SatoriChild[];
	if (isEmpty || !featured) {
		// `EmptyState`
		body = [
			card(
				[
					h('div', { fontSize: 34, fontWeight: W.semibold, color: T.foreground }, '이 기간에 신청한 곡이 아직 없어요'),
					h('div', { fontSize: 24, color: T.mutedForeground, marginTop: 10 }, '노래를 신청하면 여기에 요약이 쌓여요')
				],
				{ marginTop: 28, alignItems: 'center', padding: '96px 36px' }
			)
		];
	} else {
		body = [
			// 신청한 곡 합계
			card(
				[
					sectionLabel('신청한 곡'),
					h('div', { alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 }, [
						h('div', { alignItems: 'baseline' }, [
							h(
								'div',
								{ fontSize: 88, fontWeight: W.black, color: T.primaryText, lineHeight: 1.05, letterSpacing: '-0.02em' },
								number(stats.totalPlays)
							),
							h('div', { fontSize: 40, fontWeight: W.semibold, color: T.foreground, marginLeft: 14 }, '곡')
						]),
						stats.ranking ? rankBadge(stats.ranking, input.scopeLabel) : null
					]),
					h(
						'div',
						{ fontSize: 24, color: T.mutedForeground, marginTop: 6 },
						`약 ${formatMinutes(stats.totalMinutes)} 분량 · 서로 다른 곡 ${number(stats.uniqueTracks)}개`
					)
				],
				{ marginTop: 28 }
			),
			// 많이 신청한 곡: 1위 + 2~5위 (행은 surface-2 — 카드 안의 카드 금지)
			card(
				[
					sectionLabel('가장 많이 신청한 곡'),
					h('div', { alignItems: 'center', marginTop: 18 }, [
						cover(thumbs[0] ?? null, 130, RADIUS.control),
						h('div', { flexDirection: 'column', marginLeft: 26, flex: 1, minWidth: 0 }, [
							h('div', { fontSize: 40, fontWeight: W.semibold, color: T.foreground, ...ellipsis }, stripEmoji(featured.title)),
							h(
								'div',
								{ fontSize: 26, color: T.mutedForeground, marginTop: 4, ...ellipsis },
								stripEmoji(featured.artist) || '아티스트 정보 없음'
							),
							h('div', { fontSize: 30, fontWeight: W.black, color: T.primaryText, marginTop: 10 }, `${number(featured.plays)}번`)
						])
					]),
					rest.length > 0
						? h(
								'div',
								{ flexDirection: 'column', marginTop: 22 },
								rest.map((track, i) =>
									h(
										'div',
										{
											alignItems: 'center',
											background: T.surface2,
											borderRadius: RADIUS.control,
											padding: '10px 20px',
											marginTop: i === 0 ? 0 : 10
										},
										[
											h('div', { width: 40, fontSize: 26, fontWeight: W.semibold, color: T.mutedForeground }, String(i + 2)),
											cover(thumbs[i + 1] ?? null, 56, RADIUS.controlInner, 'surface2'),
											h('div', { flexDirection: 'column', marginLeft: 20, flex: 1, minWidth: 0 }, [
												h(
													'div',
													{ fontSize: 28, fontWeight: W.semibold, color: T.foreground, ...ellipsis },
													stripEmoji(track.title)
												),
												h('div', { fontSize: 22, color: T.mutedForeground, ...ellipsis }, stripEmoji(track.artist))
											]),
											h(
												'div',
												{ fontSize: 24, fontWeight: W.semibold, color: T.mutedForeground, marginLeft: 16 },
												`${number(track.plays)}번`
											)
										]
									)
								)
							)
						: null
				],
				{ marginTop: 16 }
			),
			// 아티스트 TOP3 — 칩은 rounded-full + control-boundary
			stats.topArtists.length > 0
				? card(
						[
							sectionLabel('자주 들은 아티스트'),
							h(
								'div',
								{ flexWrap: 'wrap', marginTop: 16 },
								stats.topArtists.slice(0, 3).map((artist) =>
									h(
										'div',
										{
											alignItems: 'center',
											background: T.surface2,
											borderRadius: 999,
											border: `2px solid ${T.borderStrong}`,
											padding: '10px 24px',
											marginRight: 12,
											fontSize: 26
										},
										[
											h('div', { fontWeight: W.semibold, color: T.foreground }, stripEmoji(artist.artist)),
											h('div', { fontWeight: W.black, color: T.primaryText, marginLeft: 12 }, number(artist.plays)),
											stats.topArtistRanking && stats.topArtistRanking.artist === artist.artist
												? h(
														'div',
														{ fontSize: 22, fontWeight: W.semibold, color: T.brand, marginLeft: 14 },
														`상위 ${stats.topArtistRanking.topPercent}%`
													)
												: null
										]
									)
								)
							)
						],
						{ marginTop: 16 }
					)
				: null,
			// 활동 요약
			card(
				[
					sectionLabel('활동'),
					h('div', { marginTop: 16, gap: 14 }, [
						statCell('활동한 날', `${number(stats.activeDays)}일`),
						statCell('최장 연속', `${number(stats.longestStreak)}일`),
						statCell('가장 활발한 때', stats.peakHour === null ? '-' : formatHour(stats.peakHour))
					]),
					h('div', { flex: 1 }),
					h('div', { marginTop: 24 }, hourBars(stats.hourCounts, stats.peakHour)),
					h(
						'div',
						{ justifyContent: 'space-between', marginTop: 10, fontSize: 20, color: T.mutedForeground },
						['0시', '6시', '12시', '18시', '24시'].map((label) => h('div', {}, label))
					)
				],
				{ marginTop: 16, flex: 1 }
			)
		];
	}

	const root = h(
		'div',
		// satori는 padding을 width 바깥에 더해서 가장자리가 잘려요 — border-box로 고정해요.
		{
			...size,
			boxSizing: 'border-box',
			flexDirection: 'column',
			background: T.background,
			color: T.foreground,
			padding: 40,
			fontFamily: CARD_FONT
		},
		[header, ...body]
	);
	return renderSatoriPng(root, size);
}
