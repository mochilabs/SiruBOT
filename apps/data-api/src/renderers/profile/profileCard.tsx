import type { CSSProperties, ReactNode } from 'react';
import { CARD_FONT, type CardTokens, createAsyncLru, hexToRgba, mixHex, RADIUS, stripEmoji, T, themedTokens, W } from '@sirubot/cards';
import { THEME_PRESET_DEFAULT, THEME_PRESET_HEX, normalizeThemePreset } from '@sirubot/utils/guildSettingsContract';
import { BOT_NAME } from '@sirubot/utils';
import { prepareArtwork, type PreparedArtwork } from '../shared/artwork.ts';
import type { IconName } from '../shared/icons.ts';
import { Box, fetchImageDataUri, Icon, renderCardPng } from '../shared/takumiKit.tsx';

export type ProfileCardVariant = 'dashboard' | 'light' | 'aura';

export interface ProfileCardInput {
	variant: ProfileCardVariant;
	themePreset?: string;
	displayName: string;
	username: string;
	avatarUrl: string | null;
	bannerUrl?: string | null;
	guildTag?: string | null;
	status: 'online' | 'idle' | 'dnd' | 'invisible';
	statusLabel: string;
	intro: string;
	createdText: string;
	joinedText: string;
	roleChips: string[];
	playlistCount: number;
	requestedCount: number;
	listenText?: string;
	checkinStreak?: number | null;
	topTracks: { title: string; artist: string; thumbnailUrl: string | null }[];
	nowPlaying: { title: string; artist: string; thumbnailUrl: string | null } | null;
}

export const PROFILE_CARD_WIDTH = 900;
const PAD = 40;
const AVATAR = 168;

export const STATUS_COLOR: Record<ProfileCardInput['status'], string> = {
	online: '#3ecf8e',
	idle: '#f5b544',
	dnd: '#ff7b8a',
	invisible: '#8a8f9c'
};

export interface Theme {
	background: string;
	panel: string;
	panelInner: string;
	border: string;
	foreground: string;
	muted: string;
	strong: string;
	accent: string;
	onAccent: string;
	chipBg: string;
	chipText: string;
}

export function darkTheme(t: CardTokens): Theme {
	return {
		background: t.background,
		panel: t.surface1,
		panelInner: t.surface2,
		border: hexToRgba(t.borderStrong, 0.35),
		foreground: t.foreground,
		muted: t.mutedForeground,
		strong: t.primaryText,
		accent: t.brand,
		onAccent: t.brandForeground,
		chipBg: hexToRgba(t.brand, 0.18),
		chipText: t.primaryText
	};
}

export const DARK: Theme = { ...darkTheme(T), border: 'rgba(163, 125, 137, 0.35)' };

export const LIGHT: Theme = {
	background: '#fff9f9',
	panel: '#ffffff',
	panelInner: '#fff0f0',
	border: '#f3d3d6',
	foreground: '#3a2c30',
	muted: '#7d686d',
	strong: '#4f1c2a',
	accent: '#ee6f8b',
	onAccent: '#4f1c2a',
	chipBg: '#ffdada',
	chipText: '#4f1c2a'
};

export const loadImage = createAsyncLru<string>(96, (url) => fetchImageDataUri(url));
const loadBackdrop = createAsyncLru<PreparedArtwork>(32, async (url) => prepareArtwork(await fetchImageDataUri(url), 64));

export const ellipsis = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const satisfies CSSProperties;
const fill = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' } as const satisfies CSSProperties;

export function Pill({ label, color, background, style }: { label: string; color: string; background: string; style?: CSSProperties }): ReactNode {
	return (
		<Box
			style={{
				alignItems: 'center',
				background,
				color,
				borderRadius: 999,
				padding: '7px 20px',
				fontSize: 24,
				fontWeight: W.semibold,
				...style
			}}
		>
			{label}
		</Box>
	);
}

function StatTile({ theme, icon, value, label, accent }: { theme: Theme; icon: IconName; value: string; label: string; accent: string }): ReactNode {
	return (
		<Box
			style={{
				flex: 1,
				flexDirection: 'column',
				background: theme.panel,
				border: `2px solid ${theme.border}`,
				borderRadius: RADIUS.control,
				padding: '20px 22px',
				minWidth: 0
			}}
		>
			<Icon name={icon} size={30} color={accent} strokeWidth={2.2} />
			<Box
				style={{
					fontSize: value.length > 6 ? 30 : 40,
					fontWeight: W.black,
					color: theme.strong,
					marginTop: value.length > 6 ? 20 : 12,
					...ellipsis
				}}
			>
				{value}
			</Box>
			<Box style={{ fontSize: 22, color: theme.muted, marginTop: 2, ...ellipsis }}>{label}</Box>
		</Box>
	);
}

export function Thumb({ uri, size, accent }: { uri: string | null; size: number; accent: string }): ReactNode {
	return uri ? (
		<img src={uri} style={{ width: size, height: size, borderRadius: RADIUS.controlInner, objectFit: 'cover', flexShrink: 0 }} />
	) : (
		<Box style={{ width: size, height: size, borderRadius: RADIUS.controlInner, background: hexToRgba(accent, 0.25), flexShrink: 0 }} />
	);
}

export async function renderProfileCard(input: ProfileCardInput): Promise<Buffer> {
	const themeAccent = THEME_PRESET_HEX[normalizeThemePreset(input.themePreset)];
	const base =
		input.variant === 'light'
			? LIGHT
			: themeAccent === THEME_PRESET_HEX[THEME_PRESET_DEFAULT]
				? DARK
				: darkTheme(themedTokens(themeAccent, THEME_PRESET_HEX[THEME_PRESET_DEFAULT]));
	const tracks = input.topTracks.slice(0, 3);

	const [avatarUri, nowUri, ...trackUris] = await Promise.all([
		input.avatarUrl ? loadImage(input.avatarUrl) : null,
		input.nowPlaying?.thumbnailUrl ? loadImage(input.nowPlaying.thumbnailUrl) : null,
		...tracks.map((t) => (t.thumbnailUrl ? loadImage(t.thumbnailUrl) : null))
	]);

	let backdrop: PreparedArtwork | null = null;
	if (input.variant === 'aura') {
		backdrop = (input.bannerUrl ? await loadBackdrop(input.bannerUrl) : null) ?? (input.avatarUrl ? await loadBackdrop(input.avatarUrl) : null);
	}
	const aura = input.variant === 'aura';
	const accent = aura ? (backdrop?.accent ?? T.brand) : base.accent;
	const theme: Theme = aura
		? {
				...base,
				panel: 'rgba(0, 0, 0, 0.30)',
				panelInner: 'rgba(0, 0, 0, 0.28)',
				border: 'rgba(255, 255, 255, 0.14)',
				strong: mixHex(accent, '#ffffff', 0.6),
				accent,
				chipBg: hexToRgba(accent, 0.3),
				chipText: mixHex(accent, '#ffffff', 0.7)
			}
		: base;

	const name = stripEmoji(input.displayName) || stripEmoji(input.username) || '이름 없음';
	const statusColor = STATUS_COLOR[input.status];
	const intro = stripEmoji(input.intro);

	const tiles: { icon: IconName; value: string; label: string }[] = [
		{ icon: 'list-music', value: `${input.playlistCount.toLocaleString('ko-KR')}개`, label: '플레이리스트' },
		{ icon: 'music', value: `${input.requestedCount.toLocaleString('ko-KR')}곡`, label: '신청한 곡' }
	];
	if (input.listenText) tiles.push({ icon: 'history', value: stripEmoji(input.listenText), label: '청취 시간' });
	if (input.checkinStreak && input.checkinStreak > 0) tiles.push({ icon: 'sparkles', value: `${input.checkinStreak}일`, label: '연속 출석' });

	const dates = (
		[
			['계정 생성', input.createdText],
			['서버 가입', input.joinedText]
		] as const
	).filter(([, value]) => value);

	const hasMusic = Boolean(input.nowPlaying) || tracks.length > 0;

	const card = (
		<Box
			style={{
				position: 'relative',
				width: PROFILE_CARD_WIDTH,
				background: theme.background,
				color: theme.foreground,
				fontFamily: CARD_FONT,
				borderRadius: RADIUS.card,
				overflow: 'hidden'
			}}
		>
			{aura ? (
				<>
					{backdrop ? (
						<img src={backdrop.backdrop} style={{ ...fill, objectFit: 'cover' }} />
					) : (
						<Box style={{ ...fill, backgroundImage: `linear-gradient(135deg, ${hexToRgba(accent, 0.3)}, ${T.surface1})` }} />
					)}
					<Box
						style={{
							...fill,
							backgroundImage: `linear-gradient(180deg, ${hexToRgba(T.background, 0.55)} 0%, ${hexToRgba(T.background, 0.88)} 100%)`
						}}
					/>
				</>
			) : null}
			<Box style={{ position: 'relative', flexDirection: 'column', width: '100%', padding: PAD, boxSizing: 'border-box' }}>
				<Box style={{ alignItems: 'center' }}>
					<Box
						style={{
							width: AVATAR + 12,
							height: AVATAR + 12,
							borderRadius: (AVATAR + 12) / 2,
							background: accent,
							alignItems: 'center',
							justifyContent: 'center',
							flexShrink: 0
						}}
					>
						{avatarUri ? (
							<img src={avatarUri} style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }} />
						) : (
							<Box style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, background: theme.panelInner }} />
						)}
					</Box>
					<Box style={{ flexDirection: 'column', marginLeft: 32, flex: 1, minWidth: 0 }}>
						<Box style={{ fontSize: 54, fontWeight: W.black, color: theme.foreground, lineHeight: 1.1, ...ellipsis }}>{name}</Box>
						<Box style={{ alignItems: 'center', marginTop: 6, minWidth: 0 }}>
							<Box style={{ fontSize: 28, color: theme.muted, minWidth: 0, ...ellipsis }}>{`@${stripEmoji(input.username)}`}</Box>
							{input.guildTag ? (
								<Pill
									label={stripEmoji(input.guildTag)}
									color={theme.chipText}
									background={theme.chipBg}
									style={{ marginLeft: 14, fontSize: 22, padding: '4px 16px', flexShrink: 0 }}
								/>
							) : null}
						</Box>
						<Box style={{ alignItems: 'center', marginTop: 14 }}>
							<Box
								style={{
									alignItems: 'center',
									background: theme.panel,
									border: `2px solid ${theme.border}`,
									borderRadius: 999,
									padding: '6px 18px'
								}}
							>
								<Box style={{ width: 12, height: 12, borderRadius: 6, background: statusColor }} />
								<Box style={{ fontSize: 22, fontWeight: W.semibold, color: theme.foreground, marginLeft: 10 }}>
									{stripEmoji(input.statusLabel) || '온라인'}
								</Box>
							</Box>
						</Box>
						{intro.trim() ? (
							<Box
								style={{
									fontSize: 26,
									color: theme.foreground,
									marginTop: 14,
									lineHeight: 1.35,
									display: 'block',
									lineClamp: 2,
									maxWidth: '100%'
								}}
							>
								{intro}
							</Box>
						) : null}
					</Box>
				</Box>

				{input.roleChips.length > 0 ? (
					<Box style={{ flexWrap: 'wrap', marginTop: 28 }}>
						{input.roleChips.slice(0, 4).map((role, i) => (
							<Pill
								key={i}
								label={stripEmoji(role)}
								color={theme.chipText}
								background={theme.chipBg}
								style={{ marginRight: 10, marginBottom: 10, maxWidth: 380, ...ellipsis }}
							/>
						))}
					</Box>
				) : null}

				<Box style={{ marginTop: 18 }}>
					{tiles.map((tile, i) => (
						<Box key={tile.label} style={{ flex: 1, marginLeft: i === 0 ? 0 : 14, minWidth: 0 }}>
							<StatTile theme={theme} icon={tile.icon} value={tile.value} label={tile.label} accent={accent} />
						</Box>
					))}
				</Box>

				{dates.length > 0 ? (
					<Box style={{ marginTop: 22, flexWrap: 'wrap' }}>
						{dates.map(([label, value]) => (
							<Box key={label} style={{ alignItems: 'center', marginRight: 36 }}>
								<Icon name="calendar" size={26} color={theme.muted} />
								<Box style={{ fontSize: 23, color: theme.muted, marginLeft: 10 }}>{label}</Box>
								<Box style={{ fontSize: 23, fontWeight: W.semibold, color: theme.foreground, marginLeft: 10 }}>{value}</Box>
							</Box>
						))}
					</Box>
				) : null}

				{hasMusic ? (
					<Box
						style={{
							flexDirection: 'column',
							marginTop: 22,
							background: theme.panel,
							border: `2px solid ${theme.border}`,
							borderRadius: RADIUS.card,
							padding: 24
						}}
					>
						<Box style={{ alignItems: 'center', marginBottom: 16 }}>
							<Icon name="disc-3" size={28} color={accent} strokeWidth={2.2} />
							<Box style={{ fontSize: 26, fontWeight: W.black, color: theme.foreground, marginLeft: 10 }}>음악</Box>
						</Box>
						{input.nowPlaying ? (
							<Box
								style={{
									alignItems: 'center',
									background: hexToRgba(accent, aura ? 0.22 : 0.16),
									borderRadius: RADIUS.controlInner,
									padding: 14,
									marginBottom: tracks.length ? 14 : 0
								}}
							>
								<Thumb uri={nowUri} size={84} accent={accent} />
								<Box style={{ flexDirection: 'column', marginLeft: 18, flex: 1, minWidth: 0 }}>
									<Box style={{ fontSize: 20, fontWeight: W.semibold, color: theme.strong }}>지금 재생 중</Box>
									<Box style={{ fontSize: 28, fontWeight: W.black, color: theme.foreground, marginTop: 2, ...ellipsis }}>
										{stripEmoji(input.nowPlaying.title)}
									</Box>
									<Box style={{ fontSize: 22, color: theme.muted, ...ellipsis }}>{stripEmoji(input.nowPlaying.artist)}</Box>
								</Box>
							</Box>
						) : null}
						{tracks.length > 0 ? (
							<Box style={{ fontSize: 21, fontWeight: W.semibold, color: theme.muted, marginBottom: 12 }}>자주 신청한 곡</Box>
						) : null}
						{tracks.map((track, i) => (
							<Box key={i} style={{ alignItems: 'center', marginTop: i === 0 ? 0 : 14 }}>
								<Box
									style={{
										width: 40,
										height: 40,
										borderRadius: 20,
										background: i === 0 ? accent : theme.panelInner,
										color: i === 0 ? theme.onAccent : theme.muted,
										alignItems: 'center',
										justifyContent: 'center',
										fontSize: 22,
										fontWeight: W.black,
										flexShrink: 0
									}}
								>
									{String(i + 1)}
								</Box>
								<Box style={{ marginLeft: 14 }}>
									<Thumb uri={trackUris[i] ?? null} size={64} accent={accent} />
								</Box>
								<Box style={{ flexDirection: 'column', marginLeft: 16, flex: 1, minWidth: 0 }}>
									<Box style={{ fontSize: 26, fontWeight: W.semibold, color: theme.foreground, ...ellipsis }}>
										{stripEmoji(track.title) || '제목 없음'}
									</Box>
									<Box style={{ fontSize: 21, color: theme.muted, ...ellipsis }}>{stripEmoji(track.artist)}</Box>
								</Box>
							</Box>
						))}
					</Box>
				) : null}

				<Box style={{ justifyContent: 'flex-end', marginTop: 22 }}>
					<Box style={{ fontSize: 20, color: theme.muted, fontWeight: W.semibold }}>{BOT_NAME}</Box>
				</Box>
			</Box>
		</Box>
	);
	return renderCardPng(card, { width: PROFILE_CARD_WIDTH });
}
