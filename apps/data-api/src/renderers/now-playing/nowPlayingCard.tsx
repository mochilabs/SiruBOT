import type { CSSProperties, ReactNode } from 'react';
import { CARD_FONT, createAsyncLru, hexToRgba, mixHex, RADIUS, stripEmoji, T, W } from '@sirubot/cards';
import { BOT_NAME } from '@sirubot/utils';
import { formatClock } from '../shared/format.ts';
import { prepareArtwork, type PreparedArtwork } from '../shared/artwork.ts';
import type { IconName } from '../shared/icons.ts';
import { Box, fetchImageDataUri, Icon, renderCardPng } from '../shared/takumiKit.tsx';

export interface NowPlayingCardInput {
	trackId: string;
	title: string;
	artist: string;
	artworkUrl: string | null;
	positionMs: number;
	durationMs: number;
	isStream: boolean;
	isPaused?: boolean;
	repeatMode?: 'off' | 'track' | 'queue';
	isRecommended?: boolean;
	nextTracks?: Array<{ title: string; artist: string | null }>;
	queueCount: number;
	queueRemainingMs: number;
	volume: number | null;
	nodeId: string | null;
	brandLine: string | null;
	chapter: { name: string; startMs: number; endMs: number } | null;
	requester: { name: string; avatarUrl: string | null } | null;
	trackUrl?: string | null;
}

export const NOW_PLAYING_CARD_WIDTH = 960;
const ART = 232;
const PAD = 32;
const NEXT_MAX = 3;

const loadArtwork = createAsyncLru<PreparedArtwork>(32, async (url) => prepareArtwork(await fetchImageDataUri(url), ART));
const loadAvatar = createAsyncLru<string>(64, (url) => fetchImageDataUri(url));

const ellipsis = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const satisfies CSSProperties;
const fill = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' } as const satisfies CSSProperties;

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
	const [artwork, avatarUri] = await Promise.all([
		input.artworkUrl ? loadArtwork(input.artworkUrl) : null,
		input.requester?.avatarUrl ? loadAvatar(input.requester.avatarUrl) : null
	]);
	const accent = artwork?.accent ?? T.brand;
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
				borderRadius: RADIUS.card,
				overflow: 'hidden',
				background: T.surface1,
				padding: PAD,
				fontFamily: CARD_FONT
			}}
		>
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
			<Box style={{ position: 'relative', flexDirection: 'column' }}>
				<Box style={{ alignItems: 'flex-start' }}>
					{artwork ? (
						<img src={artwork.art} style={{ width: ART, height: ART, borderRadius: RADIUS.control, flexShrink: 0 }} />
					) : (
						<Box style={{ width: ART, height: ART, borderRadius: RADIUS.control, background: T.surface2, flexShrink: 0 }} />
					)}
					<Box style={{ flexDirection: 'column', flex: 1, minWidth: 0, minHeight: ART, marginLeft: 28 }}>
						<Box style={{ alignItems: 'center', justifyContent: 'space-between' }}>
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
								display: 'block',
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
