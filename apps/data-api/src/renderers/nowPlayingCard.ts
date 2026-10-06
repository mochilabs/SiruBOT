/**
 * NowPlaying 카드 렌더러 — skia-canvas로 현재 재생 곡을 카드 이미지로 그려요.
 * 아트워크 + 제목/아티스트 + 프로그레스바(렌더 시점 고정) + 대기열 곡 수 + 신청자.
 * position은 렌더 시점에 박히고, 캐시 키(trackId)에서는 제외해요 — 봇이 트랙당 1회만 렌더해요.
 */
import type { Canvas, CanvasDrawable, CanvasRenderingContext2D } from 'skia-canvas';
import { ensureKoreanFont, formatClock, hashString, hexToRgba, loadImageAllowed, truncate } from './canvasUtils.ts';

export interface NowPlayingCardInput {
	/** 캐시/dedup 키 — lavalink track.info.identifier */
	trackId: string;
	title: string;
	artist: string;
	/** 아트워크 URL — data-api가 fetch해요. 실패하면 폴백 아트워크를 그려요 */
	artworkUrl: string | null;
	/** 렌더 시점 위치(ms) — 카드에 박혀요 */
	positionMs: number;
	durationMs: number;
	isStream: boolean;
	queueCount: number;
	requesterName: string | null;
}

interface Accent {
	primary: string;
	secondary: string;
}

const ACCENTS: Accent[] = [
	{ primary: '#4cc9f0', secondary: '#7209b7' },
	{ primary: '#ff6b6b', secondary: '#ff8a5c' },
	{ primary: '#8ac926', secondary: '#2a9d8f' },
	{ primary: '#ffd166', secondary: '#f4a261' },
	{ primary: '#ff70a6', secondary: '#ff9770' },
	{ primary: '#9d4edd', secondary: '#5a189a' }
];

/** 아트워크를 둥근 사각형에 cover-fit으로 그려요 */
function drawCoverFit(ctx: CanvasRenderingContext2D, img: CanvasDrawable, x: number, y: number, size: number, radius: number): void {
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(x, y, size, size, radius);
	ctx.clip();
	const iw = (img as { width: number }).width;
	const ih = (img as { height: number }).height;
	const scale = Math.max(size / iw, size / ih);
	ctx.drawImage(img, x + size / 2 - (iw * scale) / 2, y + size / 2 - (ih * scale) / 2, iw * scale, ih * scale);
	ctx.restore();
}

/** 아트워크 없을 때 폴백 — 바이닐 느낌의 기하학 디자인 (폰트 리스크 없는 도형만) */
function drawArtworkFallback(ctx: CanvasRenderingContext2D, accent: Accent, x: number, y: number, size: number, radius: number): void {
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(x, y, size, size, radius);
	ctx.clip();
	const grad = ctx.createLinearGradient(x, y, x + size, y + size);
	grad.addColorStop(0, '#1a2030');
	grad.addColorStop(1, '#0d1117');
	ctx.fillStyle = grad;
	ctx.fillRect(x, y, size, size);
	// 바이닐 동심원
	const cx = x + size / 2;
	const cy = y + size / 2;
	for (let r = size * 0.44; r > size * 0.1; r -= size * 0.055) {
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.strokeStyle = hexToRgba(accent.primary, 0.16);
		ctx.lineWidth = 2;
		ctx.stroke();
	}
	// 센터 라벨
	ctx.beginPath();
	ctx.arc(cx, cy, size * 0.1, 0, Math.PI * 2);
	ctx.fillStyle = accent.primary;
	ctx.fill();
	ctx.beginPath();
	ctx.arc(cx, cy, size * 0.028, 0, Math.PI * 2);
	ctx.fillStyle = '#0d1117';
	ctx.fill();
	ctx.restore();
	// 테두리
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(x, y, size, size, radius);
	ctx.strokeStyle = 'rgba(255,255,255,0.12)';
	ctx.lineWidth = 1.5;
	ctx.stroke();
	ctx.restore();
}

export async function renderNowPlayingCard(input: NowPlayingCardInput): Promise<Buffer> {
	const { Canvas } = await import('skia-canvas');
	await ensureKoreanFont();

	const accent = ACCENTS[hashString(input.trackId) % ACCENTS.length];

	const W = 960;
	const H = 300;
	const canvas: Canvas = new Canvas(W, H);
	const ctx = canvas.getContext('2d');

	// ── 배경 ──
	const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
	bgGrad.addColorStop(0, '#141a26');
	bgGrad.addColorStop(1, '#0d1117');
	ctx.fillStyle = bgGrad;
	ctx.fillRect(0, 0, W, H);

	// 액센트 글로우 (우상단)
	const glow = ctx.createRadialGradient(W - 120, 40, 10, W - 120, 40, 420);
	glow.addColorStop(0, hexToRgba(accent.primary, 0.22));
	glow.addColorStop(1, 'transparent');
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, W, H);

	// ── 아트워크 ──
	const ART = 244;
	const artX = 28;
	const artY = (H - ART) / 2;
	const artImg = input.artworkUrl ? await loadImageAllowed(input.artworkUrl) : null;
	if (artImg) drawCoverFit(ctx, artImg, artX, artY, ART, 20);
	else drawArtworkFallback(ctx, accent, artX, artY, ART, 20);

	// ── 텍스트 영역 ──
	const tx = artX + ART + 28;
	const right = W - 32;
	const textW = right - tx;

	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	// NOW PLAYING 라벨
	ctx.fillStyle = accent.primary;
	ctx.font = '700 17px "Noto Sans KR", sans-serif';
	ctx.fillText('NOW PLAYING', tx, 52);

	// LIVE 뱃지
	if (input.isStream) {
		ctx.save();
		ctx.font = '700 15px "Noto Sans KR", sans-serif';
		const label = 'LIVE';
		const lw = ctx.measureText(label).width + 28;
		const lx = tx + ctx.measureText('NOW PLAYING').width + 18;
		ctx.beginPath();
		ctx.roundRect(lx, 32, lw, 28, 14);
		ctx.fillStyle = '#ff3b5c';
		ctx.fill();
		ctx.fillStyle = '#ffffff';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(label, lx + lw / 2, 32 + 15);
		ctx.restore();
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
	}

	// 제목 / 아티스트
	ctx.fillStyle = '#ffffff';
	ctx.font = '700 37px "Noto Sans KR", sans-serif';
	ctx.fillText(truncate(ctx, input.title, textW), tx, 104);
	ctx.fillStyle = 'rgba(255,255,255,0.62)';
	ctx.font = '400 22px "Noto Sans KR", sans-serif';
	ctx.fillText(truncate(ctx, input.artist, textW), tx, 140);

	// ── 프로그레스바 (스트림이면 LIVE 표시) ──
	const barY = 176;
	const barW = textW;
	if (input.isStream) {
		ctx.fillStyle = '#ff3b5c';
		ctx.font = '700 20px "Noto Sans KR", sans-serif';
		ctx.fillText('실시간 스트리밍', tx, barY + 8);
	} else if (input.durationMs > 0) {
		const ratio = Math.min(1, Math.max(0, input.positionMs / input.durationMs));
		// 트랙
		ctx.beginPath();
		ctx.roundRect(tx, barY, barW, 9, 5);
		ctx.fillStyle = 'rgba(255,255,255,0.14)';
		ctx.fill();
		// 채움
		if (ratio > 0) {
			ctx.beginPath();
			ctx.roundRect(tx, barY, Math.max(9, barW * ratio), 9, 5);
			const fillGrad = ctx.createLinearGradient(tx, 0, tx + barW, 0);
			fillGrad.addColorStop(0, accent.primary);
			fillGrad.addColorStop(1, accent.secondary);
			ctx.fillStyle = fillGrad;
			ctx.fill();
			// 노브
			ctx.beginPath();
			ctx.arc(tx + barW * ratio, barY + 4.5, 9, 0, Math.PI * 2);
			ctx.fillStyle = '#ffffff';
			ctx.fill();
		}
		// 시간 라벨
		ctx.fillStyle = 'rgba(255,255,255,0.55)';
		ctx.font = '400 16px "Noto Sans KR", sans-serif';
		ctx.fillText(formatClock(input.positionMs), tx, barY + 36);
		const durText = formatClock(input.durationMs);
		ctx.textAlign = 'right';
		ctx.fillText(durText, right, barY + 36);
		ctx.textAlign = 'left';
	}

	// ── 하단 메타: 대기열 + 신청자 ──
	const metaY = 252;
	const meta: string[] = [];
	if (input.queueCount > 0) meta.push(`대기열 ${input.queueCount}곡`);
	if (input.requesterName) meta.push(`신청자 ${input.requesterName}`);
	ctx.fillStyle = 'rgba(255,255,255,0.5)';
	ctx.font = '400 18px "Noto Sans KR", sans-serif';
	ctx.fillText(meta.join(' · ') || 'SiruBOT', tx, metaY);

	// 푸터 브랜드
	ctx.textAlign = 'right';
	ctx.fillStyle = hexToRgba(accent.primary, 0.75);
	ctx.font = '700 15px "Noto Sans KR", sans-serif';
	ctx.fillText('SiruBOT', right, H - 20);

	return (await canvas.toBuffer('png')) as Buffer;
}
