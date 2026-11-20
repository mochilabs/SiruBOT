/**
 * 프로필 카드 렌더러(satori) — 대시보드 디자인 언어(tokens.ts)를 따르는 세 가지 템플릿이에요.
 *  - dashboard: 대시보드 다크 서피스 + 브랜드 핑크 강조
 *  - light:     대시보드 라이트 테마(핑크 틴트 흰 카드)
 *  - aura:      배너(없으면 아바타)에서 따온 색 번짐 배경 + 대표색 강조 — 서버 태그/역할 칩도 그 색을 따라가요
 * 높이는 내용(역할 칩·최근 곡 수)에 따라 달라요. 그림자는 resvg에서 비싸서 쓰지 않고, 경계선과 서피스 단차로 층을 나눠요.
 */
import { BOT_NAME } from '@sirubot/utils';
import { hexToRgba, mixHex, prepareArtwork, type PreparedArtwork } from './artwork.ts';
import {
	CARD_FONT,
	createAsyncLru,
	fetchImageDataUri,
	h,
	iconElement,
	img,
	renderSatoriPng,
	stripEmoji,
	type SatoriChild,
	type SatoriElement
} from './satoriKit.ts';
import { RADIUS, T, W } from './tokens.ts';

export type ProfileSatoriVariant = 'dashboard' | 'light' | 'aura';

export interface ProfileSatoriInput {
	variant: ProfileSatoriVariant;
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

const STATUS_COLOR: Record<ProfileSatoriInput['status'], string> = {
	online: '#3ecf8e',
	idle: '#f5b544',
	dnd: '#ff7b8a',
	invisible: '#8a8f9c'
};

interface Theme {
	background: string;
	/** 카드 안 패널 */
	panel: string;
	/** 패널 안 더 깊은 단 */
	panelInner: string;
	border: string;
	foreground: string;
	muted: string;
	/** 숫자·강조 텍스트 */
	strong: string;
	accent: string;
	/** accent 위 글자 */
	onAccent: string;
	/** 칩 배경/글자 */
	chipBg: string;
	chipText: string;
}

const DARK: Theme = {
	background: T.background,
	panel: T.surface1,
	panelInner: T.surface2,
	border: 'rgba(163, 125, 137, 0.35)',
	foreground: T.foreground,
	muted: T.mutedForeground,
	strong: T.primaryText,
	accent: T.brand,
	onAccent: T.brandForeground,
	chipBg: hexToRgba(T.brand, 0.18),
	chipText: T.primaryText
};

/** 대시보드 라이트 토큰(globals.css :root)을 옮긴 값 */
const LIGHT: Theme = {
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

/** 이미지는 같은 URL이면 다시 받지 않아요 — 아바타·썸네일 공용 */
const loadImage = createAsyncLru<string>(96, (url) => fetchImageDataUri(url));
/** aura 배경: 배너/아바타 → 초소형 번짐 이미지 + 대표색 */
const loadBackdrop = createAsyncLru<PreparedArtwork>(32, async (url) => prepareArtwork(await fetchImageDataUri(url), 64));

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

function pill(label: string, color: string, background: string, extra: Record<string, string | number> = {}): SatoriElement {
	return h(
		'div',
		{ alignItems: 'center', background, color, borderRadius: 999, padding: '7px 20px', fontSize: 24, fontWeight: W.semibold, ...extra },
		label
	);
}

function statTile(theme: Theme, icon: Parameters<typeof iconElement>[0], value: string, label: string, accent: string): SatoriElement {
	return h(
		'div',
		{
			flex: 1,
			flexDirection: 'column',
			background: theme.panel,
			border: `2px solid ${theme.border}`,
			borderRadius: RADIUS.control,
			padding: '20px 22px',
			minWidth: 0
		},
		[
			iconElement(icon, 30, accent, 2.2),
			h(
				'div',
				{
					fontSize: value.length > 6 ? 30 : 40,
					fontWeight: W.black,
					color: theme.strong,
					marginTop: value.length > 6 ? 20 : 12,
					...ellipsis
				},
				value
			),
			h('div', { fontSize: 22, color: theme.muted, marginTop: 2, ...ellipsis }, label)
		]
	);
}

function thumb(uri: string | null, size: number, accent: string): SatoriElement {
	return uri
		? img(uri, { width: size, height: size, borderRadius: RADIUS.controlInner, objectFit: 'cover', flexShrink: 0 })
		: h('div', { width: size, height: size, borderRadius: RADIUS.controlInner, background: hexToRgba(accent, 0.25), flexShrink: 0 });
}

export async function renderProfileCardSatori(input: ProfileSatoriInput): Promise<Buffer> {
	const base = input.variant === 'light' ? LIGHT : DARK;
	const tracks = input.topTracks.slice(0, 3);

	// 이미지는 한 번에 받아요. 실패한 것은 null이라 자리표시자로 그려요.
	const [avatarUri, nowUri, ...trackUris] = await Promise.all([
		input.avatarUrl ? loadImage(input.avatarUrl) : null,
		input.nowPlaying?.thumbnailUrl ? loadImage(input.nowPlaying.thumbnailUrl) : null,
		...tracks.map((t) => (t.thumbnailUrl ? loadImage(t.thumbnailUrl) : null))
	]);

	// aura: 배너가 있으면 배너, 없으면 아바타에서 배경과 대표색을 얻어요.
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

	const bg: SatoriChild[] = aura
		? [
				backdrop
					? img(backdrop.backdrop, { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover' })
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
					backgroundImage: `linear-gradient(180deg, ${hexToRgba(T.background, 0.55)} 0%, ${hexToRgba(T.background, 0.88)} 100%)`
				})
			]
		: [];

	const name = stripEmoji(input.displayName) || stripEmoji(input.username) || '이름 없음';
	const statusColor = STATUS_COLOR[input.status];

	// 헤더 — 아바타(액센트 링) + 이름·핸들·상태·소개
	const avatar = h(
		'div',
		{
			width: AVATAR + 12,
			height: AVATAR + 12,
			borderRadius: (AVATAR + 12) / 2,
			background: accent,
			alignItems: 'center',
			justifyContent: 'center',
			flexShrink: 0
		},
		avatarUri
			? img(avatarUri, { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 })
			: h('div', { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, background: theme.panelInner })
	);
	const handleRow: SatoriChild[] = [h('div', { fontSize: 28, color: theme.muted, ...ellipsis, minWidth: 0 }, `@${stripEmoji(input.username)}`)];
	if (input.guildTag)
		handleRow.push(
			pill(stripEmoji(input.guildTag), theme.chipText, theme.chipBg, { marginLeft: 14, fontSize: 22, padding: '4px 16px', flexShrink: 0 })
		);
	const statusRow = h('div', { alignItems: 'center', marginTop: 14 }, [
		h('div', { alignItems: 'center', background: theme.panel, border: `2px solid ${theme.border}`, borderRadius: 999, padding: '6px 18px' }, [
			h('div', { width: 12, height: 12, borderRadius: 6, background: statusColor }),
			h('div', { fontSize: 22, fontWeight: W.semibold, color: theme.foreground, marginLeft: 10 }, stripEmoji(input.statusLabel) || '온라인')
		])
	]);
	const intro = input.intro.trim()
		? h(
				'div',
				{ fontSize: 26, color: theme.foreground, marginTop: 14, lineHeight: 1.35, lineClamp: 2, maxWidth: '100%' },
				stripEmoji(input.intro)
			)
		: null;
	const header = h('div', { alignItems: 'center' }, [
		avatar,
		h('div', { flexDirection: 'column', marginLeft: 32, flex: 1, minWidth: 0 }, [
			h('div', { fontSize: 54, fontWeight: W.black, color: theme.foreground, lineHeight: 1.1, ...ellipsis }, name),
			h('div', { alignItems: 'center', marginTop: 6, minWidth: 0 }, handleRow),
			statusRow,
			intro
		])
	]);

	const chips = input.roleChips.length
		? h(
				'div',
				{ flexWrap: 'wrap', marginTop: 28 },
				input.roleChips
					.slice(0, 4)
					.map((role) =>
						pill(stripEmoji(role), theme.chipText, theme.chipBg, { marginRight: 10, marginBottom: 10, maxWidth: 380, ...ellipsis })
					)
			)
		: null;

	// 스탯 타일 — 값이 있는 것만
	const tiles: SatoriElement[] = [
		statTile(theme, 'list-music', `${input.playlistCount.toLocaleString('ko-KR')}개`, '플레이리스트', accent),
		statTile(theme, 'music', `${input.requestedCount.toLocaleString('ko-KR')}곡`, '신청한 곡', accent)
	];
	if (input.listenText) tiles.push(statTile(theme, 'history', stripEmoji(input.listenText), '청취 시간', accent));
	if (input.checkinStreak && input.checkinStreak > 0) tiles.push(statTile(theme, 'sparkles', `${input.checkinStreak}일`, '연속 출석', accent));
	const tileRow = h(
		'div',
		{ marginTop: 18 },
		tiles.map((tile, i) => h('div', { flex: 1, marginLeft: i === 0 ? 0 : 14, minWidth: 0 }, tile))
	);

	// 날짜 — 계정 생성 / 서버 가입
	const dates: SatoriElement[] = [];
	for (const [label, value] of [
		['계정 생성', input.createdText],
		['서버 가입', input.joinedText]
	] as const) {
		if (!value) continue;
		dates.push(
			h('div', { alignItems: 'center', marginRight: 36 }, [
				iconElement('calendar', 26, theme.muted, 2),
				h('div', { fontSize: 23, color: theme.muted, marginLeft: 10 }, label),
				h('div', { fontSize: 23, fontWeight: W.semibold, color: theme.foreground, marginLeft: 10 }, value)
			])
		);
	}
	const dateRow = dates.length ? h('div', { marginTop: 22, flexWrap: 'wrap' }, dates) : null;

	// 음악 패널 — 지금 재생 중 + 자주 신청한 곡
	const musicRows: SatoriElement[] = [];
	if (input.nowPlaying) {
		musicRows.push(
			h(
				'div',
				{
					alignItems: 'center',
					background: hexToRgba(accent, aura ? 0.22 : 0.16),
					borderRadius: RADIUS.controlInner,
					padding: 14,
					marginBottom: tracks.length ? 14 : 0
				},
				[
					thumb(nowUri, 84, accent),
					h('div', { flexDirection: 'column', marginLeft: 18, flex: 1, minWidth: 0 }, [
						h('div', { fontSize: 20, fontWeight: W.semibold, color: theme.strong }, '지금 재생 중'),
						h(
							'div',
							{ fontSize: 28, fontWeight: W.black, color: theme.foreground, marginTop: 2, ...ellipsis },
							stripEmoji(input.nowPlaying.title)
						),
						h('div', { fontSize: 22, color: theme.muted, ...ellipsis }, stripEmoji(input.nowPlaying.artist))
					])
				]
			)
		);
	}
	if (tracks.length) musicRows.push(h('div', { fontSize: 21, fontWeight: W.semibold, color: theme.muted, marginBottom: 12 }, '자주 신청한 곡'));
	tracks.forEach((track, i) => {
		musicRows.push(
			h('div', { alignItems: 'center', marginTop: i === 0 ? 0 : 14 }, [
				h(
					'div',
					{
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
					},
					String(i + 1)
				),
				h('div', { marginLeft: 14 }, thumb(trackUris[i] ?? null, 64, accent)),
				h('div', { flexDirection: 'column', marginLeft: 16, flex: 1, minWidth: 0 }, [
					h('div', { fontSize: 26, fontWeight: W.semibold, color: theme.foreground, ...ellipsis }, stripEmoji(track.title) || '제목 없음'),
					h('div', { fontSize: 21, color: theme.muted, ...ellipsis }, stripEmoji(track.artist))
				])
			])
		);
	});
	const music = musicRows.length
		? h(
				'div',
				{
					flexDirection: 'column',
					marginTop: 22,
					background: theme.panel,
					border: `2px solid ${theme.border}`,
					borderRadius: RADIUS.card,
					padding: 24
				},
				[
					h('div', { alignItems: 'center', marginBottom: 16 }, [
						iconElement('disc-3', 28, accent, 2.2),
						h('div', { fontSize: 26, fontWeight: W.black, color: theme.foreground, marginLeft: 10 }, '음악')
					]),
					...musicRows
				]
			)
		: null;

	const footer = h(
		'div',
		{ justifyContent: 'flex-end', marginTop: 22 },
		h('div', { fontSize: 20, color: theme.muted, fontWeight: W.semibold }, BOT_NAME)
	);

	const content = h('div', { position: 'relative', flexDirection: 'column', width: '100%', padding: PAD, boxSizing: 'border-box' }, [
		header,
		chips,
		tileRow,
		dateRow,
		music,
		footer
	]);
	const root = h(
		'div',
		{
			position: 'relative',
			width: PROFILE_CARD_WIDTH,
			background: theme.background,
			color: theme.foreground,
			fontFamily: CARD_FONT,
			borderRadius: RADIUS.card,
			overflow: 'hidden'
		},
		[...bg, content]
	);
	return renderSatoriPng(root, { width: PROFILE_CARD_WIDTH });
}
