/**
 * Wrapped 카드 렌더러 — Takumi로 개인 음악 요약을 900x1700 세로 PNG로 그려요 (스크린샷 공유용 비율).
 *
 * 디자인은 대시보드(apps/dashboard/DESIGN.md)의 다크 테마 토큰을 그대로 옮겼어요. 카드는 2배 스케일이에요
 * (rounded-card 1rem → 32, rounded-control 0.625rem → 20, p-5 → 40). 새 색을 만들지 말고 아래 토큰에서 골라요.
 * 레이아웃은 flex 선언만 쓰고, 좌표 계산은 하지 않아요.
 */
import type { CSSProperties, ReactNode } from 'react';
import { CARD_FONT, RADIUS, stripEmoji, T, W } from '@sirubot/cards';
import type { WrappedRanking, WrappedStats } from '../../services/wrapped.ts';
import { Box, fetchImageDataUri, renderCardPng } from './takumiKit.tsx';

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
 * 카드 그림자(Elev-1)는 그리지 않아요 — 다크 배경에서 거의 안 보이는 값인데 블러 필터 비용이 커요. 깊이는 surface 톤 차이로 충분해요.
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

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const satisfies CSSProperties;

/** `Card`: borderless rounded-card bg-card shadow-sm p-5 */
function Card({ children, style }: { children: ReactNode; style?: CSSProperties }): ReactNode {
	return <Box style={{ flexDirection: 'column', background: T.surface1, borderRadius: RADIUS.card, padding: 32, ...style }}>{children}</Box>;
}

/** `SectionLabel` 자리 — 카드 맨 위의 작은 회색 라벨 */
function SectionLabel({ text }: { text: string }): ReactNode {
	return <Box style={{ fontSize: 22, fontWeight: W.semibold, color: T.mutedForeground }}>{text}</Box>;
}

/** 썸네일 — 없으면 자리표시자. 놓이는 면(onSurface)과 다른 표면 색으로 칠해야 보여요. */
function Cover({
	src,
	size,
	radius,
	onSurface = 'surface1'
}: {
	src: string | null;
	size: number;
	radius: number;
	onSurface?: 'surface1' | 'surface2';
}): ReactNode {
	if (src) return <img src={src} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover' }} />;
	return <Box style={{ width: size, height: size, borderRadius: radius, background: onSurface === 'surface1' ? T.surface2 : T.surface1 }} />;
}

/** `StatCard`: bg-surface-2 rounded-control 안의 라벨 + font-black 숫자 */
function StatCell({ label, value }: { label: string; value: string }): ReactNode {
	return (
		<Box style={{ flexDirection: 'column', flex: 1, minWidth: 0, background: T.surface2, borderRadius: RADIUS.control, padding: '20px 24px' }}>
			<Box style={{ fontSize: 22, fontWeight: W.semibold, color: T.mutedForeground }}>{label}</Box>
			<Box style={{ fontSize: 40, fontWeight: W.black, color: T.primaryText, marginTop: 6, ...ellipsis }}>{value}</Box>
		</Box>
	);
}

/** "상위 N%" 알약(`button-cta` 색) + 풀 크기와 순위 캡션 — 합계 카드 오른쪽에 둬요. */
function RankBadge({ ranking, scopeLabel }: { ranking: WrappedRanking; scopeLabel: string }): ReactNode {
	return (
		<Box style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
			<Box style={{ background: T.brand, color: T.brandForeground, borderRadius: 999, padding: '8px 26px', fontSize: 34, fontWeight: W.black }}>
				{`상위 ${ranking.topPercent}%`}
			</Box>
			<Box
				style={{ fontSize: 20, color: T.mutedForeground, marginTop: 8 }}
			>{`${scopeLabel} ${number(ranking.pool)}명 중 ${number(ranking.rank)}위`}</Box>
		</Box>
	);
}

const HOUR_BAR_MAX = 120;

/** 24시간 막대 — 피크 시간만 brand, 나머지는 border-strong */
function HourBars({ counts, peakHour }: { counts: readonly number[]; peakHour: number | null }): ReactNode {
	const max = Math.max(1, ...counts);
	return (
		<Box style={{ alignItems: 'flex-end', justifyContent: 'space-between', height: HOUR_BAR_MAX, width: '100%' }}>
			{counts.map((count, hour) => (
				<Box
					key={hour}
					style={{
						width: 24,
						height: Math.max(4, Math.round((count / max) * HOUR_BAR_MAX)),
						borderRadius: 6,
						background: hour === peakHour ? T.brand : T.borderStrong,
						opacity: hour === peakHour ? 1 : 0.6
					}}
				/>
			))}
		</Box>
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
	const header = (
		<Box style={{ alignItems: 'center' }}>
			{avatar ? (
				<img src={avatar} style={{ width: 88, height: 88, borderRadius: 44 }} />
			) : (
				<Box style={{ width: 88, height: 88, borderRadius: 44, background: T.surface2 }} />
			)}
			<Box style={{ flexDirection: 'column', marginLeft: 24, flex: 1, minWidth: 0 }}>
				<Box style={{ fontSize: 48, fontWeight: W.black, letterSpacing: '-0.05em', color: T.foreground, ...ellipsis }}>
					{stripEmoji(input.displayName) || '이름 없음'}
				</Box>
				<Box
					style={{ fontSize: 24, color: T.mutedForeground, marginTop: 4 }}
				>{`시루봇 결산 · ${input.periodLabel} · ${input.scopeLabel}`}</Box>
			</Box>
		</Box>
	);

	const isEmpty = stats.totalPlays === 0 || !featured;
	const size = isEmpty ? WRAPPED_EMPTY_SIZE : WRAPPED_CARD_SIZE;

	let body: ReactNode;
	if (isEmpty || !featured) {
		// `EmptyState`
		body = (
			<Card style={{ marginTop: 28, alignItems: 'center', padding: '96px 36px' }}>
				<Box style={{ fontSize: 34, fontWeight: W.semibold, color: T.foreground }}>이 기간에 신청한 곡이 아직 없어요</Box>
				<Box style={{ fontSize: 24, color: T.mutedForeground, marginTop: 10 }}>노래를 신청하면 여기에 요약이 쌓여요</Box>
			</Card>
		);
	} else {
		body = (
			<>
				{/* 신청한 곡 합계 */}
				<Card style={{ marginTop: 28 }}>
					<SectionLabel text="신청한 곡" />
					<Box style={{ alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 }}>
						<Box style={{ alignItems: 'baseline' }}>
							<Box style={{ fontSize: 88, fontWeight: W.black, color: T.primaryText, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
								{number(stats.totalPlays)}
							</Box>
							<Box style={{ fontSize: 40, fontWeight: W.semibold, color: T.foreground, marginLeft: 14 }}>곡</Box>
						</Box>
						{stats.ranking ? <RankBadge ranking={stats.ranking} scopeLabel={input.scopeLabel} /> : null}
					</Box>
					<Box style={{ fontSize: 24, color: T.mutedForeground, marginTop: 6 }}>
						{`약 ${formatMinutes(stats.totalMinutes)} 분량 · 서로 다른 곡 ${number(stats.uniqueTracks)}개`}
					</Box>
				</Card>
				{/* 많이 신청한 곡: 1위 + 2~5위 (행은 surface-2 — 카드 안의 카드 금지) */}
				<Card style={{ marginTop: 16 }}>
					<SectionLabel text="가장 많이 신청한 곡" />
					<Box style={{ alignItems: 'center', marginTop: 18 }}>
						<Cover src={thumbs[0] ?? null} size={130} radius={RADIUS.control} />
						<Box style={{ flexDirection: 'column', marginLeft: 26, flex: 1, minWidth: 0 }}>
							<Box style={{ fontSize: 40, fontWeight: W.semibold, color: T.foreground, ...ellipsis }}>{stripEmoji(featured.title)}</Box>
							<Box style={{ fontSize: 26, color: T.mutedForeground, marginTop: 4, ...ellipsis }}>
								{stripEmoji(featured.artist) || '아티스트 정보 없음'}
							</Box>
							<Box
								style={{ fontSize: 30, fontWeight: W.black, color: T.primaryText, marginTop: 10 }}
							>{`${number(featured.plays)}번`}</Box>
						</Box>
					</Box>
					{rest.length > 0 ? (
						<Box style={{ flexDirection: 'column', marginTop: 22 }}>
							{rest.map((track, i) => (
								<Box
									key={i}
									style={{
										alignItems: 'center',
										background: T.surface2,
										borderRadius: RADIUS.control,
										padding: '10px 20px',
										marginTop: i === 0 ? 0 : 10
									}}
								>
									<Box style={{ width: 40, fontSize: 26, fontWeight: W.semibold, color: T.mutedForeground }}>{String(i + 2)}</Box>
									<Cover src={thumbs[i + 1] ?? null} size={56} radius={RADIUS.controlInner} onSurface="surface2" />
									<Box style={{ flexDirection: 'column', marginLeft: 20, flex: 1, minWidth: 0 }}>
										<Box style={{ fontSize: 28, fontWeight: W.semibold, color: T.foreground, ...ellipsis }}>
											{stripEmoji(track.title)}
										</Box>
										<Box style={{ fontSize: 22, color: T.mutedForeground, ...ellipsis }}>{stripEmoji(track.artist)}</Box>
									</Box>
									<Box
										style={{ fontSize: 24, fontWeight: W.semibold, color: T.mutedForeground, marginLeft: 16 }}
									>{`${number(track.plays)}번`}</Box>
								</Box>
							))}
						</Box>
					) : null}
				</Card>
				{/* 아티스트 TOP3 — 칩은 rounded-full + control-boundary */}
				{stats.topArtists.length > 0 ? (
					<Card style={{ marginTop: 16 }}>
						<SectionLabel text="자주 들은 아티스트" />
						<Box style={{ flexWrap: 'wrap', marginTop: 16 }}>
							{stats.topArtists.slice(0, 3).map((artist, i) => (
								<Box
									key={i}
									style={{
										alignItems: 'center',
										background: T.surface2,
										borderRadius: 999,
										border: `2px solid ${T.borderStrong}`,
										padding: '10px 24px',
										marginRight: 12,
										fontSize: 26
									}}
								>
									<Box style={{ fontWeight: W.semibold, color: T.foreground }}>{stripEmoji(artist.artist)}</Box>
									<Box style={{ fontWeight: W.black, color: T.primaryText, marginLeft: 12 }}>{number(artist.plays)}</Box>
									{stats.topArtistRanking && stats.topArtistRanking.artist === artist.artist ? (
										<Box
											style={{ fontSize: 22, fontWeight: W.semibold, color: T.brand, marginLeft: 14 }}
										>{`상위 ${stats.topArtistRanking.topPercent}%`}</Box>
									) : null}
								</Box>
							))}
						</Box>
					</Card>
				) : null}
				{/* 활동 요약 */}
				<Card style={{ marginTop: 16, flex: 1 }}>
					<SectionLabel text="활동" />
					<Box style={{ marginTop: 16, gap: 14 }}>
						<StatCell label="활동한 날" value={`${number(stats.activeDays)}일`} />
						<StatCell label="최장 연속" value={`${number(stats.longestStreak)}일`} />
						<StatCell label="가장 활발한 때" value={stats.peakHour === null ? '-' : formatHour(stats.peakHour)} />
					</Box>
					<Box style={{ flex: 1 }} />
					<Box style={{ marginTop: 24 }}>
						<HourBars counts={stats.hourCounts} peakHour={stats.peakHour} />
					</Box>
					<Box style={{ justifyContent: 'space-between', marginTop: 10, fontSize: 20, color: T.mutedForeground }}>
						{['0시', '6시', '12시', '18시', '24시'].map((label) => (
							<Box key={label}>{label}</Box>
						))}
					</Box>
				</Card>
			</>
		);
	}

	const root = (
		<Box
			style={{
				...size,
				boxSizing: 'border-box',
				flexDirection: 'column',
				background: T.background,
				color: T.foreground,
				padding: 40,
				fontFamily: CARD_FONT
			}}
		>
			{header}
			{body}
		</Box>
	);
	return renderCardPng(root, size);
}
