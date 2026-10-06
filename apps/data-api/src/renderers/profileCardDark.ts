/**
 * 프로필 카드 — 프리셋 1 (RINE 다크 퍼플 스타일).
 * ✦ RINE | PROFILE 로고 헤더 + 퍼플 그라디언트 + 별 스파클, 아바타(상태 도트),
 * 이름/핸들, 온라인 캡슐, 역할 캡슐, 두 날짜(디스코드 가입/서버 합류),
 * 아래에 지금 재생 중 + 자주 신청한 곡. 이모지 대신 lucide 벡터 아이콘.
 */
import type { Canvas, CanvasDrawable, CanvasRenderingContext2D } from 'skia-canvas';
import { drawIcon, ensureKoreanFont, hashString, loadImageAllowed, truncate } from './canvasUtils.ts';
import { drawMusicSection, measureMusicSection, type CardPalette, type ProfileNowPlaying } from './profileWidgets.ts';

export interface ProfileCardDarkInput {
	userId: string;
	/** 화면에 표시할 핸들(@뒤) — 유저네임 */
	profileId: string;
	displayName: string;
	avatarUrl: string | null;
	/** 'online' | 'idle' | 'dnd' | 'invisible' */
	status: 'online' | 'idle' | 'dnd' | 'invisible';
	/** 캡슐 라벨 — 기본 "온라인" */
	onlineLabel: string;
	/** 상태 도트 커스텀 색(#hex) — 없으면 status에서 파생 */
	statusColor: string;
	/** 한 줄 소개 — 비어있으면 생략 */
	intro: string;
	/** "2021. 04. 16" 포맷 문자열 */
	createdText: string;
	joinedText: string;
	/** 역할 캡슐 라벨 (최대 4개 표시) */
	roleChips: string[];
	topTracks: { title: string; artist: string; thumbnailUrl: string | null }[];
	/** 지금 재생 중인 곡 (플레이어가 살아있을 때만) */
	nowPlaying?: ProfileNowPlaying | null;
}

// ── 다크 퍼플 팔레트 (RINE 샘플 기준) ──
const PAL: CardPalette = {
	page: '#191122',
	card: '#221a30',
	cardBorder: 'rgba(255, 255, 255, 0.06)',
	chip: '#2a2136',
	chipText: '#cabdf2',
	text: '#f6f1fa',
	textMuted: '#b6aec4',
	textFaint: 'rgba(246, 241, 250, 0.55)',
	accent: '#c9b1f0',
	online: '#8ee7ae',
	separator: 'rgba(182, 174, 196, 0.24)',
	thumbBg: '#2e2440',
	rankBg: '#cabdf2',
	rankText: '#221a30'
};

const W = 920;
const PAD = 44;
const HEADER_H = 208; // 그라디언트 헤더 높이
const AVATAR_R = 62;

const STATUS_COLORS: Record<string, string> = {
	online: '#3ecf8e',
	idle: '#f0b232',
	dnd: '#ef4444',
	invisible: '#747a8d'
};

/** 상태 도트 색 */
function statusColorOf(input: ProfileCardDarkInput): string {
	if (input.statusColor && input.statusColor.startsWith('#')) return input.statusColor;
	return STATUS_COLORS[input.status] ?? STATUS_COLORS.online;
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, color = '#ffffff', rotation = 0, stretch = 1): void {
	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.fillStyle = color;
	ctx.translate(x, y);
	ctx.rotate(rotation);
	ctx.scale(stretch, 1);
	const spike = 2.4;
	ctx.beginPath();
	ctx.moveTo(0, -r * spike);
	ctx.quadraticCurveTo(r * 0.4, -r * 0.4, r * spike, 0);
	ctx.quadraticCurveTo(r * 0.4, r * 0.4, 0, r * spike);
	ctx.quadraticCurveTo(-r * 0.4, r * 0.4, -r * spike, 0);
	ctx.quadraticCurveTo(-r * 0.4, -r * 0.4, 0, -r * spike);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}

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

function makeRng(seed: number): () => number {
	let s = seed || 1;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

function fmtStatusDot(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fillStyle = PAL.page;
	ctx.fill();
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fillStyle = color;
	ctx.fill();
	ctx.restore();
}

export async function renderProfileCardDark(input: ProfileCardDarkInput): Promise<Buffer> {
	const { Canvas } = await import('skia-canvas');
	await ensureKoreanFont();
	const rng = makeRng(hashString(input.userId));
	const dotColor = statusColorOf(input);

	// ── 레이아웃 산출 ──
	const avatarCx = PAD + AVATAR_R;
	const avatarCy = HEADER_H + 6; // 헤더 경계에 걸치게
	const nameX = PAD + AVATAR_R * 2 + 44;
	const nameBase = avatarCy - 8;
	const handleBase = nameBase + 46;

	const chipTop = handleBase + 58;
	const chipH = 42;
	const hasChips = input.roleChips.length > 0;

	const introBase = chipTop + (hasChips ? chipH : 0) + (hasChips ? 56 : 0);
	const hasIntro = input.intro.trim().length > 0;

	const datesTop = Math.max(avatarCy + AVATAR_R + 46, hasChips ? chipTop + chipH + 64 : chipTop, hasIntro ? introBase + 74 : 0);
	const dateLabelTop = datesTop;
	const dateValueTop = datesTop + 40;
	const datesBottom = dateValueTop + 50;

	// 음악 섹션(선택) — 하단
	const showsMusic = input.topTracks.length > 0 || !!input.nowPlaying;
	const musicTop = datesBottom + 40;
	const musicH = showsMusic ? measureMusicSection(input.topTracks, input.nowPlaying ?? null) : 0;
	const footerBase = showsMusic ? musicTop + musicH + 46 : datesBottom + 40;
	const H = footerBase + 34;

	const canvas: Canvas = new Canvas(W, H);
	const ctx = canvas.getContext('2d');

	// ── 배경 ──
	ctx.fillStyle = PAL.page;
	ctx.fillRect(0, 0, W, H);

	// ── 헤더 그라디언트 + 스파클 ──
	ctx.save();
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(W, 0);
	ctx.lineTo(W, HEADER_H - 26);
	// 우하단 살짝 라운드 처리 대신 사다리꼴 그대로 — 배경과 자연스러운 교차
	ctx.lineTo(W - 120, HEADER_H);
	ctx.lineTo(120, HEADER_H);
	ctx.lineTo(0, HEADER_H - 26);
	ctx.closePath();
	const headGrad = ctx.createLinearGradient(0, 0, W * 0.72, HEADER_H);
	headGrad.addColorStop(0, '#a98cd6');
	headGrad.addColorStop(0.45, '#6b517f');
	headGrad.addColorStop(1, '#241a2e');
	ctx.fillStyle = headGrad;
	ctx.fill();
	// 부드러운 물결 하이라이트
	ctx.clip();
	const waveGrad = ctx.createLinearGradient(0, HEADER_H - 70, 0, HEADER_H);
	waveGrad.addColorStop(0, 'rgba(255,255,255,0)');
	waveGrad.addColorStop(1, 'rgba(255,255,255,0.07)');
	ctx.fillStyle = waveGrad;
	ctx.beginPath();
	ctx.moveTo(0, HEADER_H - 46);
	for (let x = 0; x <= W; x += 26) ctx.lineTo(x, HEADER_H - 46 + Math.sin((x / W) * Math.PI * 2.4 + 0.6) * 9);
	ctx.lineTo(W, HEADER_H);
	ctx.lineTo(0, HEADER_H);
	ctx.closePath();
	ctx.fill();
	// 별
	for (let i = 0; i < 26; i++) {
		const x = W * 0.38 + rng() * W * 0.6;
		const y = 14 + rng() * (HEADER_H - 34);
		drawStar(ctx, x, y, rng() * 1.8 + 0.4, 0.14 + rng() * 0.45);
	}
	drawStar(ctx, W - 96, 66, 11, 0.95, '#fdf6ff');
	drawStar(ctx, W - 128, 96, 4.5, 0.65, '#fdf6ff');
	drawStar(ctx, W - 74, 108, 3, 0.5, '#fdf6ff');
	// 곡선 궤도 라인 2개
	ctx.strokeStyle = 'rgba(255,255,255,0.10)';
	ctx.lineWidth = 1.5;
	for (const k of [0, 1]) {
		ctx.beginPath();
		ctx.ellipse(W * 0.62 + k * 40, HEADER_H + 30, W * 0.42, 44 + k * 26, -0.16, Math.PI * 1.02, Math.PI * 1.95);
		ctx.stroke();
	}
	ctx.restore();

	// ── 헤더 로고: ✦ RINE | PROFILE ──
	ctx.save();
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	drawIcon(ctx, 'sparkle', PAD + 2, 27, 22, '#ffffff', { fill: true });
	ctx.fillStyle = '#ffffff';
	ctx.font = '800 27px "Noto Sans KR", sans-serif';
	ctx.fillText('RINE', PAD + 36, 39);
	const rinw = ctx.measureText('RINE').width;
	ctx.fillStyle = 'rgba(255,255,255,0.42)';
	ctx.fillRect(PAD + 44 + rinw, 24, 2, 30);
	ctx.fillStyle = 'rgba(255,255,255,0.8)';
	ctx.font = '600 17px "Noto Sans KR", sans-serif';
	ctx.fillText('PROFILE', PAD + 58 + rinw, 40);
	ctx.restore();

	// ── 아바타: 헤더 경계에 걸치게 + 라이트 링 ──
	ctx.save();
	ctx.beginPath();
	ctx.arc(avatarCx, avatarCy, AVATAR_R + 6, 0, Math.PI * 2);
	ctx.fillStyle = '#efe6f7';
	ctx.fill();
	ctx.restore();
	if (input.avatarUrl) {
		const img = await loadImageAllowed(input.avatarUrl);
		if (img) drawCircleImage(ctx, img, avatarCx, avatarCy, AVATAR_R);
		else drawAvatarFallback(ctx, avatarCx, avatarCy, AVATAR_R);
	} else {
		drawAvatarFallback(ctx, avatarCx, avatarCy, AVATAR_R);
	}
	fmtStatusDot(ctx, avatarCx + AVATAR_R * 0.76, avatarCy + AVATAR_R * 0.76, 11, dotColor);

	// ── 이름 + ✦ / 핸들 ──
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	const nameText = truncate(ctx, input.displayName, W - nameX - 240);
	ctx.fillStyle = PAL.text;
	ctx.font = '800 44px "Noto Sans KR", sans-serif';
	ctx.fillText(nameText, nameX, nameBase);
	const nameW = ctx.measureText(nameText).width;
	drawIcon(ctx, 'sparkle', nameX + nameW + 16, nameBase - 24, 20, PAL.accent, { fill: true });

	ctx.fillStyle = PAL.textMuted;
	ctx.font = '500 22px "Noto Sans KR", sans-serif';
	ctx.fillText(`@${input.profileId}`, nameX, handleBase);

	// ── 온라인 상태 캡슐 (우측) ──
	const stLabel = input.onlineLabel || '온라인';
	ctx.save();
	ctx.font = '600 19px "Noto Sans KR", sans-serif';
	const stW = ctx.measureText(stLabel).width + 64;
	const stX = W - PAD - stW;
	const stY = handleBase - 46;
	ctx.beginPath();
	ctx.roundRect(stX, stY, stW, 44, 22);
	ctx.fillStyle = 'rgba(142, 231, 174, 0.08)';
	ctx.fill();
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.beginPath();
	ctx.arc(stX + 28, stY + 22, 6, 0, Math.PI * 2);
	ctx.fillStyle = dotColor;
	ctx.fill();
	ctx.fillStyle = PAL.online;
	ctx.fillText(stLabel, stX + stW / 2 + 10, stY + 23);
	ctx.restore();

	// ── 역할 캡슐 ──
	if (hasChips) {
		let chipX = nameX;
		ctx.save();
		ctx.font = '500 18px "Noto Sans KR", sans-serif';
		ctx.fillStyle = PAL.textMuted;
		ctx.fillText('역할', chipX, chipTop + 27);
		chipX += ctx.measureText('역할').width + 20;
		ctx.restore();
		for (const label of input.roleChips.slice(0, 4)) {
			// 칩 배경/텍스트
			ctx.save();
			ctx.font = '500 17px "Noto Sans KR", sans-serif';
			const w = ctx.measureText(label).width + 40;
			ctx.beginPath();
			ctx.roundRect(chipX, chipTop, w, chipH, chipH / 2);
			ctx.fillStyle = PAL.chip;
			ctx.fill();
			ctx.fillStyle = PAL.chipText;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(label, chipX + w / 2, chipTop + chipH / 2 + 1);
			ctx.restore();
			chipX += w + 12;
		}
	}

	// ── 소개 문구 ──
	if (hasIntro) {
		ctx.fillStyle = 'rgba(246, 241, 250, 0.9)';
		ctx.font = '500 21px "Noto Sans KR", sans-serif';
		ctx.fillText(truncate(ctx, input.intro.trim(), W - PAD * 2 - 40), PAD, introBase);
	}

	// ── 구분선 ──
	const separatorY = datesTop - 44;
	ctx.fillStyle = PAL.separator;
	ctx.fillRect(PAD, separatorY, W - PAD * 2, 1.5);

	// ── 두 날짜 컬럼 (lucide calendar 아이콘) ──
	const colSplit = W * 0.47;
	const col2X = colSplit + 40;
	const dateIconY = dateLabelTop;

	const drawDateCol = (label: string, value: string, x: number, valueAlign: 'left' | 'right', valueX?: number): void => {
		drawIcon(ctx, 'calendar', x, dateIconY, 20, PAL.accent);
		ctx.fillStyle = PAL.textMuted;
		ctx.font = '500 18px "Noto Sans KR", sans-serif';
		ctx.textAlign = 'left';
		ctx.fillText(label, x + 30, dateIconY + 16);
		ctx.fillStyle = PAL.text;
		ctx.font = '500 38px "Noto Sans KR", ui-sans-serif, sans-serif';
		if (valueAlign === 'right' && valueX != null) ctx.fillText(value, valueX, dateValueTop + 34);
		else ctx.fillText(value, x, dateValueTop + 34);
	};

	drawDateCol('디스코드 가입', input.createdText, PAD, 'left');
	// 세로 구분선 + 오른쪽 열(값은 좌측 정렬로 카드 밸런스 유지)
	ctx.save();
	ctx.strokeStyle = PAL.separator;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(colSplit, dateIconY - 6);
	ctx.lineTo(colSplit, dateValueTop + 44);
	ctx.stroke();
	ctx.restore();
	drawDateCol('서버 합류', input.joinedText, col2X, 'left');

	// ── 음악 섹션 ──
	if (showsMusic) {
		await drawMusicSection(ctx, input.topTracks, input.nowPlaying ?? null, PAL, PAD, musicTop, W - PAD * 2);
	}

	// ── 하단: ✦ {id} / profile   ...   샘플 프레임 ──
	ctx.save();
	ctx.fillStyle = PAL.textFaint;
	ctx.textAlign = 'left';
	drawIcon(ctx, 'sparkle', PAD, H - 30, 15, PAL.textFaint, { fill: true });
	ctx.font = '500 15px "Noto Sans KR", sans-serif';
	ctx.fillText(`${input.profileId} / profile`, PAD + 22, H - 17);
	ctx.textAlign = 'right';
	ctx.fillText('샘플 프레임', W - PAD, H - 17);
	ctx.restore();

	return (await canvas.toBuffer('png')) as Buffer;
}

function drawAvatarFallback(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.fillStyle = '#b7a3d6';
	ctx.fill();
	drawIcon(ctx, 'music-2', cx - 16, cy - 16, 32, '#5c4a78');
	ctx.restore();
}
