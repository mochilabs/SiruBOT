/**
 * 프로필 카드 — 프리셋 2 (RINE 멤버패스 티켓 스타일).
 * 크림 본문 + 세이지 그린 스텁(오른쪽), 절취선(런치홀 + 대시), 상단 MEMBER PASS,
 * 아바타/이름/핸들/온라인/소개/역할/두 날짜, 스텁엔 세로 대형 @{id},
 * 본문에 지금 재생 중 + 2x2 미니 스탯. 이모지 대신 lucide 벡터 아이콘.
 */
import type { Canvas, CanvasDrawable, CanvasRenderingContext2D } from 'skia-canvas';
import { drawIcon, ensureKoreanFont, loadImageAllowed, truncate } from './canvasUtils.ts';
import { drawMusicSection, measureMusicSection, type ProfileNowPlaying } from './profileWidgets.ts';

export interface ProfileCardTicketInput {
	userId: string;
	profileId: string;
	displayName: string;
	avatarUrl: string | null;
	/** 디스코드 서버 태그(4자리) — 있으면 핸들 옆에 뱃지로 표시 */
	guildTag?: string | null;
	guildTagBadgeUrl?: string | null;
	status: 'online' | 'idle' | 'dnd' | 'invisible';
	onlineLabel: string;
	statusColor: string;
	intro: string;
	createdText: string;
	joinedText: string;
	roleChips: string[];
	/** 라이트 톤 스탯 (라벨/값) 쌍 4개 — 없으면 곡 패널만 */
	stats?: { label: string; value: string; icon: 'list-music' | 'music' | 'disc-3' | 'history' }[];
	topTracks: { title: string; artist: string; thumbnailUrl: string | null }[];
	nowPlaying?: ProfileNowPlaying | null;
}

const W = 920;
const PAD = 44;
const STUB_W = 250; // 오른쪽 티켓 스텁
const BODY_W = W - STUB_W;
const H = 560;
const RADIUS = 28;

const STATUS_COLORS: Record<string, string> = {
	online: '#2f9e5f',
	idle: '#c28a1f',
	dnd: '#cf3f3f',
	invisible: '#747a8d'
};

// ── 크림/세이지 팔레트 ──
const CREAM = '#f3efe6';
const CREAM_SOFT = 'rgba(255,255,255,0.55)';
const SAGE = '#bfd3c5';
const SAGE_DEEP = '#4f6a58';
const SAGE_MID = '#5d7a66';
const INK = '#3f3a35';
const INK_MUTED = 'rgba(63, 58, 53, 0.62)';
const CHIP_PINK_BG = '#e8d4d2';
const CHIP_PINK_TEXT = '#b97f7e';
const CHIP_GREEN_BG = '#d6e4da';
const CHIP_GREEN_TEXT = '#61826c';
const ACCENT_ROSE = '#a96a64';

function drawCircleImage(ctx: CanvasRenderingContext2D, img: CanvasDrawable, cx: number, cy: number, radius: number): void {
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.clip();
	const iw = (img as { width: number }).width;
	const ih = (img as { height: number }).height;
	const scale = Math.max((radius * 2) / iw, (radius * 2) / ih);
	ctx.drawImage(img, cx - (iw * scale) / 2, cy - (ih * scale) / 2, iw * scale, ih * scale);
	ctx.restore();
}

function drawChip(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, bg: string, color: string): number {
	ctx.save();
	ctx.font = '500 16px "Noto Sans KR", sans-serif';
	const w = ctx.measureText(label).width + 36;
	ctx.beginPath();
	ctx.roundRect(x, y, w, 36, 18);
	ctx.fillStyle = bg;
	ctx.fill();
	ctx.fillStyle = color;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(label, x + w / 2, y + 19);
	ctx.restore();
	return w;
}

/** 티켓 스텁 절취선: 런치홀 2개 + 세로 대시 */
function drawPerforation(ctx: CanvasRenderingContext2D, x: number, h: number): void {
	ctx.save();
	// 런치홀 (위/아래) — page 배경색 원
	ctx.fillStyle = '#efeae0';
	ctx.beginPath();
	ctx.arc(x, 0, 12, 0, Math.PI * 2);
	ctx.fill();
	ctx.beginPath();
	ctx.arc(x, h, 12, 0, Math.PI * 2);
	ctx.fill();
	// 세로 대시
	ctx.strokeStyle = 'rgba(79, 106, 88, 0.4)';
	ctx.lineWidth = 2;
	ctx.setLineDash([7, 9]);
	ctx.beginPath();
	ctx.moveTo(x, 16);
	ctx.lineTo(x, h - 16);
	ctx.stroke();
	ctx.setLineDash([]);
	ctx.restore();
}

export async function renderProfileCardTicket(input: ProfileCardTicketInput): Promise<Buffer> {
	const { Canvas } = await import('skia-canvas');
	await ensureKoreanFont();
	const dotColor = STATUS_COLORS[input.status] ?? (input.statusColor.startsWith('#') ? input.statusColor : STATUS_COLORS.online);

	// ── 본문 높이 산출 (티켓은 고정 폭, 콘텐츠에 따라 높이 가변) ──
	const BODY_PAD_X = 40;
	const contentW = BODY_W - BODY_PAD_X * 2 - 72; // 스텁과 겹치지 않게
	const avatarR = 46;
	const avatarCx = PAD + avatarR;
	const nameX = PAD + avatarR * 2 + 36;
	const nameBase = 150;
	const handleBase = nameBase + 40;
	const statusY = handleBase + 50; // 온라인 캡슐 (핸들 아래)

	const chipTop = statusY + 66;
	const hasChips = input.roleChips.length > 0;
	const chipH = 36;

	const introBase = chipTop + (hasChips ? chipH + 62 : 0);
	const hasIntro = input.intro.trim().length > 0;

	const statsTop = Math.max(avatarCx + avatarR + 56, hasChips ? chipTop + chipH + 72 : chipTop, hasIntro ? introBase + 66 : 0);
	const hasStats = (input.stats?.length ?? 0) >= 2;
	let afterStats = statsTop;
	if (hasStats) {
		const stRows = Math.ceil((input.stats?.length ?? 0) / 2);
		afterStats = statsTop + 82 + stRows * 84 + 14;
	}

	const musicTop = afterStats + 26;
	const musicH = measureMusicSection(input.topTracks, input.nowPlaying ?? null);
	const musicBottom = hasStats || input.topTracks.length > 0 || input.nowPlaying ? musicTop + musicH : musicTop;
	const bodyContentBottom = Math.max(musicBottom, avatarCx + avatarR + 40, handleBase + 36);
	const H2 = Math.max(H, bodyContentBottom + 40);

	const canvas: Canvas = new Canvas(W, H2);
	const ctx = canvas.getContext('2d');

	// ── 배경(페이지: 크림 외곽) + 티켓 본문 ──
	ctx.fillStyle = '#efeae0';
	ctx.fillRect(0, 0, W, H2);

	// 티켓 본체 (크림) — 전체 라운드 클립
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(0, 0, W, H2, RADIUS);
	ctx.clip();

	// 본문 배경
	ctx.fillStyle = CREAM;
	ctx.fillRect(0, 0, BODY_W, H2);
	// 스텁 배경 (세이지)
	ctx.fillStyle = SAGE;
	ctx.fillRect(BODY_W, 0, STUB_W, H2);
	// 스텁 글로우
	const stubGrad = ctx.createLinearGradient(BODY_W, 0, W, H2);
	stubGrad.addColorStop(0, 'rgba(255,255,255,0.10)');
	stubGrad.addColorStop(1, 'rgba(79,106,88,0.16)');
	ctx.fillStyle = stubGrad;
	ctx.fillRect(BODY_W, 0, STUB_W, H2);

	// ── 스텁 내용: MEMBER PASS / ✦ / 세로 대형 @{id} / PERSONAL PROFILE ──
	const stubCx = BODY_W + STUB_W / 2;
	ctx.save();
	ctx.textAlign = 'center';
	ctx.fillStyle = SAGE_DEEP;
	ctx.font = '700 19px "Noto Sans KR", ui-sans-serif, sans-serif';
	ctx.fillText('MEMBER PASS', stubCx, 58);

	// 스파클 (4point)
	ctx.save();
	ctx.translate(stubCx, 128);
	ctx.scale(1, 1.5);
	ctx.fillStyle = SAGE_DEEP;
	ctx.beginPath();
	ctx.moveTo(0, -20);
	ctx.quadraticCurveTo(4, -4, 20, 0);
	ctx.quadraticCurveTo(4, 4, 0, 20);
	ctx.quadraticCurveTo(-4, 4, -20, 0);
	ctx.quadraticCurveTo(-4, -4, 0, -20);
	ctx.fill();
	ctx.restore();

	// 세로 대형 @{id} — 스텁 안에 클립해서 그려요 (아래→위)
	const verticalName = `@${input.profileId}`.toUpperCase();
	ctx.save();
	ctx.beginPath();
	ctx.rect(BODY_W + 16, 170, STUB_W - 32, H2 - 246);
	ctx.clip();
	ctx.fillStyle = SAGE_DEEP;
	ctx.font = '700 62px "Noto Sans KR", ui-sans-serif, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.translate(stubCx, (170 + (H2 - 246) / 2 + 82) / 1);
	// 텍스트 세로폭이 클립보다 길면 폰트를 줄여요
	const maxVertH = H2 - 246;
	const nameW90 = Math.max(2, Math.floor(ctx.measureText(verticalName).width));
	// 회전 후 텍스트 세로(=미회전 width) 를 maxVertH에 맞춰요
	let vSize = 62;
	if (nameW90 > maxVertH) {
		vSize = Math.max(30, Math.floor((62 * (maxVertH - 20)) / nameW90));
		ctx.font = `700 ${vSize}px "Noto Sans KR", ui-sans-serif, sans-serif`;
	}
	ctx.rotate(-Math.PI / 2);
	ctx.fillText(verticalName, 0, 0);
	ctx.restore();
	ctx.textBaseline = 'alphabetic';

	ctx.textAlign = 'center';
	ctx.fillStyle = 'rgba(79, 106, 88, 0.75)';
	ctx.font = '600 15px "Noto Sans KR", ui-sans-serif, sans-serif';
	ctx.fillText('PERSONAL PROFILE', stubCx, H2 - 40);
	ctx.restore();

	// ── 절취선 ──
	drawPerforation(ctx, BODY_W, H2);

	// ── 본문: {ID} / MEMBER PASS 헤더 + 구분선 ──
	ctx.save();
	ctx.textAlign = 'left';
	ctx.font = '600 17px "Noto Sans KR", ui-sans-serif, sans-serif';
	ctx.fillStyle = 'rgba(169, 106, 100, 0.55)';
	ctx.fillText(`${input.profileId.toUpperCase()} / MEMBER PASS`, PAD, 36);
	ctx.strokeStyle = 'rgba(63, 58, 53, 0.14)';
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(PAD, 58);
	ctx.lineTo(BODY_W - 40, 58);
	ctx.stroke();
	ctx.restore();

	// ── 아바타 ──
	const avatarCy = nameBase - 34;
	ctx.save();
	ctx.beginPath();
	ctx.arc(avatarCx, avatarCy, avatarR + 4, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(190, 154, 158, 0.35)';
	ctx.fill();
	ctx.restore();
	if (input.avatarUrl) {
		const img = await loadImageAllowed(input.avatarUrl).catch(() => null);
		if (img) drawCircleImage(ctx, img, avatarCx, avatarCy, avatarR);
		else drawAvatarFallback(ctx, avatarCx, avatarCy, avatarR);
	} else drawAvatarFallback(ctx, avatarCx, avatarCy, avatarR);

	// ── 이름/핸들/서버태그/온라인 ──
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = INK;
	ctx.font = '800 46px "Noto Sans KR", sans-serif';
	ctx.fillText(truncate(ctx, input.displayName, contentW - nameX + PAD + 40), nameX, nameBase + 12);
	ctx.fillStyle = INK_MUTED;
	ctx.font = '500 22px "Noto Sans KR", sans-serif';
	const tkHandle = `@${input.profileId}`;
	ctx.fillText(tkHandle, nameX, handleBase + 8);
	const tkHandleW = ctx.measureText(tkHandle).width;

	// 서버 태그 뱃지
	if (input.guildTag) {
		const tagY = handleBase + 8 - 21;
		let tagX = nameX + tkHandleW + 14;
		if (input.guildTagBadgeUrl) {
			const badge = await loadImageAllowed(input.guildTagBadgeUrl).catch(() => null);
			if (badge) {
				const BH = 22;
				const bw = (badge as unknown as { width: number }).width;
				const bh = (badge as unknown as { height: number }).height;
				const s = BH / bh;
				ctx.drawImage(badge, tagX, tagY, bw * s, BH);
				tagX += Math.floor(bw * s) + 8;
			}
		}
		ctx.save();
		ctx.font = '700 17px "Noto Sans KR", sans-serif';
		ctx.fillStyle = SAGE_DEEP;
		ctx.fillText(input.guildTag, tagX, handleBase + 8);
		ctx.restore();
	}

	// 온라인 캡슐 (핸들 아래, 텍스트 좌측 정렬 시작에 붙임)
	ctx.save();
	ctx.font = '600 16px "Noto Sans KR", sans-serif';
	const stW = ctx.measureText(input.onlineLabel).width + 60;
	ctx.beginPath();
	ctx.roundRect(nameX, statusY - 22, stW, 40, 20);
	ctx.fillStyle = CHIP_GREEN_BG;
	ctx.fill();
	ctx.beginPath();
	ctx.arc(nameX + 26, statusY - 2, 5.5, 0, Math.PI * 2);
	ctx.fillStyle = dotColor;
	ctx.fill();
	ctx.fillStyle = SAGE_MID;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(input.onlineLabel, nameX + stW / 2 + 8, statusY - 1);
	ctx.restore();

	// ── 역할 캡슐 ──
	if (hasChips) {
		let chipX = PAD;
		ctx.save();
		ctx.font = '500 17px "Noto Sans KR", sans-serif';
		ctx.fillStyle = INK;
		ctx.fillText('역할', PAD, chipTop + 19);
		const labelW = ctx.measureText('역할').width;
		chipX = PAD + labelW + 18;
		ctx.restore();
		for (let i = 0; i < input.roleChips.length && i < 4; i++) {
			const pink = i % 2 === 0;
			const w = drawChip(ctx, input.roleChips[i], chipX, chipTop, pink ? CHIP_PINK_BG : CHIP_GREEN_BG, pink ? CHIP_PINK_TEXT : CHIP_GREEN_TEXT);
			chipX += w + 12;
		}
	}

	// ── 소개 ──
	if (hasIntro) {
		ctx.fillStyle = 'rgba(63, 58, 53, 0.86)';
		ctx.font = '500 19px "Noto Sans KR", sans-serif';
		ctx.fillText(truncate(ctx, input.intro.trim(), contentW), PAD, introBase);
	}

	// ── 구분선 + 두 날짜 ──
	const sepY = statsTop - 44;
	ctx.strokeStyle = 'rgba(63, 58, 53, 0.12)';
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(PAD, sepY);
	ctx.lineTo(BODY_W - 40, sepY);
	ctx.stroke();

	const colSplit = PAD + contentW * 0.44;
	drawDateColumn(ctx, '디스코드 가입', input.createdText, PAD, statsTop, '#a96a64');
	// 세로 미세 구분선
	ctx.save();
	ctx.strokeStyle = 'rgba(63, 58, 53, 0.12)';
	ctx.beginPath();
	ctx.moveTo(colSplit, statsTop - 8);
	ctx.lineTo(colSplit, statsTop + 66);
	ctx.stroke();
	ctx.restore();
	drawDateColumn(ctx, '서버 합류', input.joinedText, colSplit + 36, statsTop, '#a96a64');

	// ── 미니 스탯 (2열 그리드, 라이트 카드) ──
	if (hasStats) {
		const stats = input.stats ?? [];
		const stW2 = (BODY_W - PAD * 2 - 72 - 16) / 2;
		for (let i = 0; i < stats.length; i++) {
			const row = Math.floor(i / 2);
			const col = i % 2;
			const sx = PAD + col * (stW2 + 16);
			const sy = statsTop + 82 + row * 84;
			ctx.save();
			ctx.beginPath();
			ctx.roundRect(sx, sy, stW2, 68, 14);
			ctx.fillStyle = CREAM_SOFT;
			ctx.fill();
			ctx.strokeStyle = 'rgba(63, 58, 53, 0.10)';
			ctx.lineWidth = 1.2;
			ctx.stroke();
			drawIcon(ctx, stats[i].icon, sx + 16, sy + 13, 17, '#a96a64');
			ctx.fillStyle = INK_MUTED;
			ctx.font = '500 15px "Noto Sans KR", sans-serif';
			ctx.textAlign = 'left';
			ctx.fillText(stats[i].label, sx + 40, sy + 25);
			ctx.fillStyle = INK;
			ctx.font = '800 22px "Noto Sans KR", sans-serif';
			ctx.fillText(stats[i].value, sx + 16, sy + 56);
			ctx.restore();
		}
	}

	// ── 음악 섹션 (지금 재생 중 + 자주 신청한 곡 — 라이트 톤 팔레트로 로컬 조정) ──
	if (input.topTracks.length > 0 || input.nowPlaying) {
		await drawMusicSection(ctx, input.topTracks, input.nowPlaying ?? null, LIGHT_MUSIC_PAL, PAD, musicTop, contentW);
	}

	// ── 하단: {id} / profile  ...  샘플 프레임 ──
	ctx.save();
	ctx.textAlign = 'left';
	ctx.font = '500 17px "Noto Sans KR", sans-serif';
	ctx.fillStyle = 'rgba(169, 106, 100, 0.8)';
	ctx.fillText(`${input.profileId} / profile`, PAD, H2 - 22);
	ctx.textAlign = 'right';
	ctx.fillStyle = 'rgba(63, 58, 53, 0.5)';
	ctx.fillText('샘플 프레임', BODY_W - 40, H2 - 22);
	ctx.restore();

	ctx.restore(); // 티켓 라운드 클립 끝

	return (await canvas.toBuffer('png')) as Buffer;
}

/** 티켓(크림) 톤 음악 팔레트 — profileWidgets의 CardPalette로 변환해 써요 */
const LIGHT_MUSIC_PAL = {
	page: CREAM,
	card: '#fbf8f2',
	cardBorder: 'rgba(63, 58, 53, 0.10)',
	chip: CHIP_GREEN_BG,
	chipText: CHIP_GREEN_TEXT,
	text: INK,
	textMuted: 'rgba(63, 58, 53, 0.62)',
	textFaint: 'rgba(63, 58, 53, 0.5)',
	accent: ACCENT_ROSE,
	online: '#2f9e5f',
	separator: 'rgba(63, 58, 53, 0.12)',
	thumbBg: '#e6dfd2',
	rankBg: ACCENT_ROSE,
	rankText: '#fbf8f2'
};

function drawDateColumn(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, top: number, iconColor: string): void {
	drawIcon(ctx, 'calendar', x, top, 22, iconColor);
	ctx.fillStyle = INK_MUTED;
	ctx.font = '500 18px "Noto Sans KR", sans-serif';
	ctx.textAlign = 'left';
	ctx.fillText(label, x + 30, top + 18);
	ctx.fillStyle = INK;
	ctx.font = '500 32px "Noto Sans KR", ui-sans-serif, sans-serif';
	ctx.fillText(value, x, top + 60);
}

function drawAvatarFallback(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.fillStyle = '#d8c7cd';
	ctx.fill();
	drawIcon(ctx, 'music-2', cx - 14, cy - 14, 28, 'rgba(63, 58, 53, 0.45)');
	ctx.restore();
}
