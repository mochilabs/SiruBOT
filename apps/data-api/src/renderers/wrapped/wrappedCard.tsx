import type { CSSProperties, ReactNode } from 'react';
import { CARD_FONT, RADIUS, stripEmoji, T, W } from '@sirubot/cards';
import type { WrappedRanking, WrappedStats } from '../../services/wrapped.ts';
import { Box, fetchImageDataUri, renderCardPng } from '../shared/takumiKit.tsx';

export const WRAPPED_CARD_SIZE = { width: 900, height: 1700 } as const;
const WRAPPED_EMPTY_SIZE = { width: 900, height: 470 } as const;

export interface WrappedCardInput {
	displayName: string;
	avatarUrl: string | null;
	periodLabel: string;
	scopeLabel: string;
	stats: WrappedStats;
}

const number = (n: number): string => n.toLocaleString('ko-KR');

export function formatMinutes(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return `${rest}분`;
	return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

export function formatHour(hour: number): string {
	const period = hour < 12 ? '오전' : '오후';
	const h12 = hour % 12 === 0 ? 12 : hour % 12;
	return `${period} ${h12}시`;
}

const ellipsis = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const satisfies CSSProperties;

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }): ReactNode {
	return <Box style={{ flexDirection: 'column', background: T.surface1, borderRadius: RADIUS.card, padding: 32, ...style }}>{children}</Box>;
}

function SectionLabel({ text }: { text: string }): ReactNode {
	return <Box style={{ fontSize: 22, fontWeight: W.semibold, color: T.mutedForeground }}>{text}</Box>;
}

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

function StatCell({ label, value }: { label: string; value: string }): ReactNode {
	return (
		<Box style={{ flexDirection: 'column', flex: 1, minWidth: 0, background: T.surface2, borderRadius: RADIUS.control, padding: '20px 24px' }}>
			<Box style={{ fontSize: 22, fontWeight: W.semibold, color: T.mutedForeground }}>{label}</Box>
			<Box style={{ fontSize: 40, fontWeight: W.black, color: T.primaryText, marginTop: 6, ...ellipsis }}>{value}</Box>
		</Box>
	);
}

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
	const [avatar, ...thumbs] = await Promise.all([
		fetchImageDataUri(input.avatarUrl),
		...stats.topTracks.slice(0, 5).map((track) => fetchImageDataUri(track.thumbnail))
	]);

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
		body = (
			<Card style={{ marginTop: 28, alignItems: 'center', padding: '96px 36px' }}>
				<Box style={{ fontSize: 34, fontWeight: W.semibold, color: T.foreground }}>이 기간에 신청한 곡이 아직 없어요</Box>
				<Box style={{ fontSize: 24, color: T.mutedForeground, marginTop: 10 }}>노래를 신청하면 여기에 요약이 쌓여요</Box>
			</Card>
		);
	} else {
		body = (
			<>
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
										marginBottom: 10,
										maxWidth: '100%',
										fontSize: 26
									}}
								>
									<Box style={{ fontWeight: W.semibold, color: T.foreground, minWidth: 0, ...ellipsis }}>
										{stripEmoji(artist.artist)}
									</Box>
									<Box style={{ fontWeight: W.black, color: T.primaryText, marginLeft: 12, flexShrink: 0 }}>
										{number(artist.plays)}
									</Box>
									{stats.topArtistRanking && stats.topArtistRanking.artist === artist.artist ? (
										<Box
											style={{
												fontSize: 22,
												fontWeight: W.semibold,
												color: T.brand,
												marginLeft: 14,
												flexShrink: 0,
												whiteSpace: 'nowrap'
											}}
										>{`상위 ${stats.topArtistRanking.topPercent}%`}</Box>
									) : null}
								</Box>
							))}
						</Box>
					</Card>
				) : null}
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
