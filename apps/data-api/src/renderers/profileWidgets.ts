/**
 * 프로필 카드 공용 위젯 — dark(프리셋1) / ticket(프리셋2) 렌더러가 함께 써요.
 * - lucide 아이콘 스타일의 벡터 드로잉 (canvasUtils.drawIcon)
 * - '지금 재생 중' 배너 + '자주 신청한 곡' 리스트 (썸네일, 랭크 배지)
 */
import type { CanvasRenderingContext2D } from 'skia-canvas';
import { drawIcon, loadImageAllowed, truncate } from './canvasUtils.ts';

export interface ProfileNowPlaying {
	title: string;
	artist: string;
	thumbnailUrl: string | null;
}

export interface TopTrackSnippet {
	title: string;
	artist: string;
	thumbnailUrl: string | null;
}

export interface CardPalette {
	page: string;
	card: string;
	cardBorder: string;
	chip: string;
	chipText: string;
	text: string;
	textMuted: string;
	textFaint: string;
	accent: string;
	online: string;
	separator: string;
	thumbBg: string;
	rankBg: string;
	rankText: string;
}

const NP_THUMB = 62;
const NP_H = NP_THUMB + 44;
const THUMB = 48;
const ROW_GAP = 12;
const PANEL_HEADER = 56;
const PANEL_PAD_X = 26;

/** 음악 섹션 높이 계산 — 지금 재생 중(있으면) + 자주 신청한 곡(최대 3행) */
export function measureMusicSection(topTracks: TopTrackSnippet[], nowPlaying: ProfileNowPlaying | null): number {
	let h = 0;
	if (nowPlaying) h += NP_H + 18;
	const rows = Math.min(3, topTracks.length);
	if (rows > 0) h += PANEL_HEADER + rows * THUMB + (rows - 1) * ROW_GAP + 24;
	return h > 0 ? h : 0;
}

/** 음악 섹션 그리기 — (x, y)는 섹션 좌상단 */
export async function drawMusicSection(
	ctx: CanvasRenderingContext2D,
	topTracks: TopTrackSnippet[],
	nowPlaying: ProfileNowPlaying | null,
	pal: CardPalette,
	x: number,
	y: number,
	contentW: number
): Promise<void> {
	let cy = y;

	// ── 지금 재생 중 배너 ──
	if (nowPlaying) {
		ctx.save();
		ctx.beginPath();
		ctx.roundRect(x, cy, contentW, NP_H, 18);
		ctx.fillStyle = pal.card;
		ctx.fill();
		ctx.strokeStyle = pal.cardBorder;
		ctx.lineWidth = 1.5;
		ctx.stroke();
		// 썸네일
		if (nowPlaying.thumbnailUrl) {
			const img = await loadImageAllowed(nowPlaying.thumbnailUrl).catch(() => null);
			if (img) {
				ctx.save();
				ctx.beginPath();
				ctx.roundRect(x + 20, cy + 22, NP_THUMB, NP_THUMB, 12);
				ctx.clip();
				const iw = (img as { width: number }).width;
				const ih = (img as { height: number }).height;
				const s = Math.max(NP_THUMB / iw, NP_THUMB / ih);
				ctx.drawImage(img, x + 20 + NP_THUMB / 2 - (iw * s) / 2, cy + 22 + NP_THUMB / 2 - (ih * s) / 2, iw * s, ih * s);
				ctx.restore();
			} else drawThumbFallback(ctx, x + 20, cy + 22, NP_THUMB, 12, pal);
		} else drawThumbFallback(ctx, x + 20, cy + 22, NP_THUMB, 12, pal);
		// 라벨 + 음표 아이콘
		const labelX = x + 20 + NP_THUMB + 20;
		drawIcon(ctx, 'disc-3', labelX, cy + 26, 18, pal.accent);
		ctx.fillStyle = pal.accent;
		ctx.font = '700 15px "Noto Sans KR", sans-serif';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		ctx.fillText('지금 재생 중', labelX + 25, cy + 41);
		// 제목/아티스트
		const textX = labelX;
		const textW = x + contentW - textX - 24;
		ctx.fillStyle = pal.text;
		ctx.font = '700 19px "Noto Sans KR", sans-serif';
		ctx.fillText(truncate(ctx, nowPlaying.title, textW), textX, cy + 72);
		ctx.fillStyle = pal.textMuted;
		ctx.font = '400 15px "Noto Sans KR", sans-serif';
		ctx.fillText(truncate(ctx, nowPlaying.artist, textW), textX, cy + 96);
		ctx.restore();
		cy += NP_H + 18;
	}

	// ── 자주 신청한 곡 패널 ──
	const rows = Math.min(3, topTracks.length);
	if (rows > 0) {
		const panelH = PANEL_HEADER + rows * THUMB + (rows - 1) * ROW_GAP + 24;
		ctx.save();
		ctx.beginPath();
		ctx.roundRect(x, cy, contentW, panelH, 18);
		ctx.fillStyle = pal.card;
		ctx.fill();
		ctx.strokeStyle = pal.cardBorder;
		ctx.lineWidth = 1.5;
		ctx.stroke();
		ctx.restore();

		// 패널 헤더: 트로피 아이콘 + '자주 신청한 곡'
		drawIcon(ctx, 'trophy', x + PANEL_PAD_X, cy + 20, 19, pal.accent);
		ctx.fillStyle = pal.accent;
		ctx.font = '800 16px "Noto Sans KR", sans-serif';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		ctx.fillText('자주 신청한 곡', x + PANEL_PAD_X + 27, cy + 34);

		const textX = x + PANEL_PAD_X + THUMB + 16;
		const textW = x + contentW - textX - PANEL_PAD_X;
		const rowY0 = cy + PANEL_HEADER;
		for (let i = 0; i < rows; i++) {
			const t = topTracks[i];
			const ry = rowY0 + i * (THUMB + ROW_GAP);
			// 썸네일
			let thumbDrawn = false;
			if (t.thumbnailUrl) {
				const img = await loadImageAllowed(t.thumbnailUrl).catch(() => null);
				if (img) {
					ctx.save();
					ctx.beginPath();
					ctx.roundRect(x + PANEL_PAD_X, ry, THUMB, THUMB, 10);
					ctx.clip();
					const iw = (img as { width: number }).width;
					const ih = (img as { height: number }).height;
					const s = Math.max(THUMB / iw, THUMB / ih);
					ctx.drawImage(img, x + PANEL_PAD_X + THUMB / 2 - (iw * s) / 2, ry + THUMB / 2 - (ih * s) / 2, iw * s, ih * s);
					ctx.restore();
					thumbDrawn = true;
				}
			}
			if (!thumbDrawn) drawThumbFallback(ctx, x + PANEL_PAD_X, ry, THUMB, 10, pal);
			// 랭크 배지 (썸네일 좌상단)
			ctx.save();
			ctx.beginPath();
			ctx.roundRect(x + PANEL_PAD_X, ry, 22, 22, 7);
			ctx.fillStyle = pal.rankBg;
			ctx.fill();
			ctx.fillStyle = pal.rankText;
			ctx.font = '800 12px "Noto Sans KR", sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(String(i + 1), x + PANEL_PAD_X + 11, ry + 11.5);
			ctx.restore();
			ctx.textBaseline = 'alphabetic';
			// 제목/아티스트
			ctx.fillStyle = pal.text;
			ctx.font = '700 17px "Noto Sans KR", sans-serif';
			ctx.fillText(truncate(ctx, t.title, textW), textX, ry + 20);
			ctx.fillStyle = pal.textMuted;
			ctx.font = '400 14px "Noto Sans KR", sans-serif';
			ctx.fillText(truncate(ctx, t.artist, textW), textX, ry + 42);
		}
	}
}

/** 썸네일 로드 실패/없음 폴백 — 배경 + 음표 아이콘 */
function drawThumbFallback(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, radius: number, pal: CardPalette): void {
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(x, y, size, size, radius);
	ctx.fillStyle = pal.thumbBg;
	ctx.fill();
	drawIcon(ctx, 'music-2', x + size / 2 - 11, y + size / 2 - 11, 22, pal.textMuted);
	ctx.restore();
}
