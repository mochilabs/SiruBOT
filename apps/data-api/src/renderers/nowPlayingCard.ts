/**
 * NowPlaying 카드 렌더러 — skia-canvas로 현재 재생 곡을 카드 이미지로 그려요.
 * 아트워크 + 제목 + 아티스트 + 챕터/신청자/추천·일시정지 뱃지 + 진행바 + 다음 곡 목록 +
 * 하단 메타(대기열/볼륨/반복/노드) + 브랜드(봇이름/버전). 배경 액센트는 아트워크의 도미넌트 컬러.
 *
 * 갱신 주기 — 봇이 카드 키에 5초 위치 버킷을 넣어요: 트랙 변경/볼륨/챕터/버킷이 바뀔 때만
 * 다시 렌더하고, 그 전에는 이전 버킷 이미지가 그대로 보여요. 매초 재렌더는 하지 않아요.
 */
import type { Canvas, CanvasDrawable, CanvasRenderingContext2D } from 'skia-canvas';
import { drawCircleImage, drawIcon, ensureKoreanFont, formatClock, hashString, loadImageAllowed, truncate, type IconName } from './canvasUtils.ts';

export interface NowPlayingCardInput {
	/** 캐시/dedup 키 — lavalink track.info.identifier */
	trackId: string;
	title: string;
	/** 아티스트 — 제목 아래 표기해요 */
	artist: string;
	/** 아트워크 URL — data-api가 fetch해요. 실패하면 폴백 아트워크를 그려요 */
	artworkUrl: string | null;
	/** 재생 위치(ms) — 진행바 진행율로 그려져요 */
	positionMs: number;
	durationMs: number;
	isStream: boolean;
	/** 일시정지 상태 — 일시정지 뱃지를 박아요 */
	isPaused?: boolean;
	/** 반복 모드 — off가 아니면 하단 메타에 표기해요 */
	repeatMode?: 'off' | 'track' | 'queue';
	/** 현재 곡이 봇 추천(related) 곡인지 — 봇 추천 뱃지를 박아요 */
	isRecommended?: boolean;
	/** 다음 곡 목록(유저 대기열 기준) — 공간이 허용되는 만큼(최대 3) 그려요 */
	nextTracks?: Array<{ title: string; artist: string | null }>;
	/** 하단 메타 — 카드에 박아요 */
	queueCount: number;
	/** 대기열 전체 남은 시간(ms) — 0이면 미표기 */
	queueRemainingMs: number;
	volume: number | null;
	nodeId: string | null;
	/** 브랜드 줄 (봇 이름 + 버전/해시) */
	brandLine: string | null;
	/** 현재 재생 중인 챕터 — 있으면 제목 아래에 구간을 표시해요 */
	chapter: { name: string; startMs: number; endMs: number } | null;
	/** 신청자 — 있으면 카드에 아바타 + 이름을 박아요 (상단 우측) */
	requester: { name: string; avatarUrl: string | null } | null;
	/** 곡 원본 URL — 이미지에는 클릭 불가라 표기하지 않고 스키마 호환용으로 유지해요 */
	trackUrl?: string | null;
}

/** rgb -> '#rrggbb' */
function rgbToHex(r: number, g: number, b: number): string {
	const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
	return `#${((1 << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).slice(1)}`;
}

/** 아트워크에서 도미넌트 컬러를 추출해요 — 32x32 축색에서 채도 가중 평균 + 최고 가중 픽셀을 섞어요 */
async function extractDominantColorAsync(img: CanvasDrawable): Promise<string | null> {
	try {
		const iw = (img as { width: number }).width;
		const ih = (img as { height: number }).height;
		if (!iw || !ih) return null;

		const { Canvas } = await import('skia-canvas');
		const S = 32;
		const small: Canvas = new Canvas(S, S);
		const sctx = small.getContext('2d');
		sctx.drawImage(img, 0, 0, S, S);
		const data = sctx.getImageData(0, 0, S, S).data;

		let bestR = 0;
		let bestG = 0;
		let bestB = 0;
		let bestWeight = 0;
		let sumR = 0;
		let sumG = 0;
		let sumB = 0;
		let sumW = 0;
		for (let i = 0; i < data.length; i += 4) {
			const r = data[i]!;
			const g = data[i + 1]!;
			const b = data[i + 2]!;
			const a = data[i + 3]!;
			if (a < 200) continue;
			const max = Math.max(r, g, b);
			const min = Math.min(r, g, b);
			const saturation = max === 0 ? 0 : (max - min) / max;
			const lightness = (max + min) / 2 / 255;
			// 너무 밝거나(흰 배경) 어둡거나(검은 배경) 무채색이면 가중치를 크게 깎는다
			const weight = saturation * (1 - Math.abs(lightness - 0.55) * 1.6);
			sumR += r * weight;
			sumG += g * weight;
			sumB += b * weight;
			sumW += weight;
			if (weight > bestWeight) {
				bestWeight = weight;
				bestR = r;
				bestG = g;
				bestB = b;
			}
		}
		// 유의미한 채도 픽셀이 없으면 평균(무채색이라도 트랙 고유 색으로 쓴다)
		if (sumW <= 0.0001) {
			let accR = 0;
			let accG = 0;
			let accB = 0;
			let count = 0;
			for (let i = 0; i < data.length; i += 4) {
				if (data[i + 3]! < 200) continue;
				accR += data[i]!;
				accG += data[i + 1]!;
				accB += data[i + 2]!;
				count++;
			}
			if (count === 0) return null;
			return rgbToHex(accR / count, accG / count, accB / count);
		}
		// 채도 가중 평균 + 최고 가중 픽셀을 섞어 대표색으로
		return rgbToHex((sumR / sumW) * 0.6 + bestR * 0.4, (sumG / sumW) * 0.6 + bestG * 0.4, (sumB / sumW) * 0.6 + bestB * 0.4);
	} catch {
		return null;
	}
}

/** 추출색을 카드에서 안전하게 쓸 수 있는 밝기로 보정 — 너무 어두우면 밝히고, 너무 밝으면 어둡게 */
function normalizeAccent(hex: string): string {
	const n = parseInt(hex.slice(1), 16);
	let r = (n >> 16) & 255;
	let g = (n >> 8) & 255;
	let b = n & 255;
	const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
	const target = 0.55;
	if (luma < 0.25) {
		const k = (target - luma) / (1 - luma);
		r += (255 - r) * k * 0.9;
		g += (255 - g) * k * 0.9;
		b += (255 - b) * k * 0.9;
	} else if (luma > 0.82) {
		const k = 0.55;
		r *= k;
		g *= k;
		b *= k;
	}
	return rgbToHex(r, g, b);
}

/** 도미넌트 추출 실패 시 폴백 프리셋 */
const FALLBACK_ACCENTS: string[] = ['#4cc9f0', '#ff6b6b', '#8ac926', '#ffd166', '#ff70a6', '#9d4edd'];

function fallbackAccent(trackId: string): { primary: string } {
	return { primary: FALLBACK_ACCENTS[hashString(trackId) % FALLBACK_ACCENTS.length]! };
}

/** 아트워크를 둥근 사각형에 cover-fit으로 그려요 — 1:1이면 슬롯에 딱 맞게 crop돼요 (비율 유지) */
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
function drawArtworkFallback(ctx: CanvasRenderingContext2D, accent: { primary: string }, x: number, y: number, size: number, radius: number): void {
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
		ctx.strokeStyle = `${accent.primary}29`;
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

/** 뱃지/pill 공통 — (x, y) 좌상단 박스에 icon+label을 그리고 끝 x를 돌려줘요. */
function drawPill(
	ctx: CanvasRenderingContext2D,
	options: { x: number; y: number; icon: IconName; label: string; bg: string; border?: string; fg?: string }
): number {
	const { x, y, icon, label, bg } = options;
	const H = 28;
	ctx.save();
	ctx.font = '500 14px "Noto Sans KR", sans-serif';
	const labelW = ctx.measureText(label).width;
	const w = 12 + 16 + 5 + labelW + 12;
	ctx.beginPath();
	ctx.roundRect(x, y, w, H, H / 2);
	ctx.fillStyle = bg;
	ctx.fill();
	if (options.border) {
		ctx.beginPath();
		ctx.roundRect(x, y, w, H, H / 2);
		ctx.strokeStyle = options.border;
		ctx.lineWidth = 1;
		ctx.stroke();
	}
	drawIcon(ctx, icon, x + 11, y + (H - 14) / 2, 14, options.fg ?? 'rgba(255,255,255,0.85)');
	ctx.fillStyle = options.fg ?? 'rgba(255,255,255,0.85)';
	ctx.textBaseline = 'middle';
	ctx.fillText(label, x + 12 + 16 + 5, y + H / 2 + 0.5);
	ctx.textBaseline = 'alphabetic';
	ctx.restore();
	return x + w;
}

export async function renderNowPlayingCard(input: NowPlayingCardInput): Promise<Buffer> {
	const { Canvas } = await import('skia-canvas');
	await ensureKoreanFont();

	const W = 960;
	const H = 372;
	const canvas: Canvas = new Canvas(W, H);
	const ctx = canvas.getContext('2d');

	// ── 액센트: 아트워크 도미넌트 컬러 ──
	const artImg = input.artworkUrl ? await loadImageAllowed(input.artworkUrl) : null;
	let accent: { primary: string };
	if (artImg) {
		const dominant = await extractDominantColorAsync(artImg);
		accent = dominant ? { primary: normalizeAccent(dominant) } : fallbackAccent(input.trackId);
	} else {
		accent = fallbackAccent(input.trackId);
	}

	// ── 배경: 아트워크 기반 딤 그라디언트 ──
	const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
	bgGrad.addColorStop(0, '#141a26');
	bgGrad.addColorStop(1, '#0d1117');
	ctx.fillStyle = bgGrad;
	ctx.fillRect(0, 0, W, H);

	// 액센트 글로우 (우상단)
	const glow = ctx.createRadialGradient(W - 120, 40, 10, W - 120, 40, 420);
	glow.addColorStop(0, `${accent.primary}38`);
	glow.addColorStop(1, 'transparent');
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, W, H);

	// ── 아트워크 ──
	const ART = 244;
	const artX = 28;
	const artY = (H - ART) / 2;
	if (artImg) drawCoverFit(ctx, artImg, artX, artY, ART, 20);
	else drawArtworkFallback(ctx, accent, artX, artY, ART, 20);

	// ── 텍스트 영역 ──
	const tx = artX + ART + 28;
	const right = W - 32;
	const textW = right - tx;

	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	// NOW PLAYING 라벨 + 상태 뱃지들 (LIVE · 일시정지 · 봇 추천)
	ctx.fillStyle = accent.primary;
	ctx.font = '700 17px "Noto Sans KR", sans-serif';
	ctx.fillText('NOW PLAYING', tx, 52);
	let badgeX = tx + ctx.measureText('NOW PLAYING').width + 14;
	if (input.isStream) {
		badgeX = drawPill(ctx, { x: badgeX, y: 32, icon: 'radio', label: 'LIVE', bg: '#ff3b5c', fg: '#ffffff' }) + 8;
	}
	if (input.isPaused) {
		badgeX = drawPill(ctx, { x: badgeX, y: 32, icon: 'pause', label: '일시정지', bg: 'rgba(255,255,255,0.13)' }) + 8;
	}
	if (input.isRecommended) {
		badgeX =
			drawPill(ctx, {
				x: badgeX,
				y: 32,
				icon: 'sparkle',
				label: '봇 추천',
				bg: `${accent.primary}2e`,
				border: `${accent.primary}66`
			}) + 8;
	}
	// 반복 상태도 뱃지로 — 하단 메타 폭이 좁으면 잘려서 안 보이므로 위쪽에 고정해요.
	if (input.repeatMode === 'track') {
		badgeX = drawPill(ctx, { x: badgeX, y: 32, icon: 'repeat-1', label: '반복: 현재 곡', bg: 'rgba(255,255,255,0.13)' }) + 8;
	} else if (input.repeatMode === 'queue') {
		badgeX = drawPill(ctx, { x: badgeX, y: 32, icon: 'repeat', label: '반복: 대기열', bg: 'rgba(255,255,255,0.13)' }) + 8;
	}

	// ── 신청자 pill — 상단 우측 (뱃지와 겹치면 생략, 텍스트 라인 멘션이 폴백) ──
	const reqImg = input.requester?.avatarUrl ? await loadImageAllowed(input.requester.avatarUrl) : null;
	if (input.requester?.name) {
		ctx.save();
		ctx.font = '500 15px "Noto Sans KR", sans-serif';
		const nameText = truncate(ctx, input.requester.name, 150);
		const nameW = ctx.measureText(nameText).width;
		const AV = 22;
		const pillH = 30;
		const pillW = 10 + AV + 8 + nameW + 14;
		const pillX = right - pillW;
		if (pillX > badgeX + 20) {
			const pillY = 31;
			ctx.beginPath();
			ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
			ctx.fillStyle = 'rgba(255,255,255,0.07)';
			ctx.fill();
			ctx.beginPath();
			ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
			ctx.strokeStyle = 'rgba(255,255,255,0.12)';
			ctx.lineWidth = 1;
			ctx.stroke();
			if (reqImg) {
				drawCircleImage(ctx, reqImg, pillX + 10 + AV / 2, pillY + pillH / 2, AV / 2);
			} else {
				ctx.beginPath();
				ctx.arc(pillX + 10 + AV / 2, pillY + pillH / 2, AV / 2, 0, Math.PI * 2);
				ctx.fillStyle = 'rgba(255,255,255,0.1)';
				ctx.fill();
				drawIcon(ctx, 'users', pillX + 10 + AV / 2 - 7, pillY + pillH / 2 - 7, 14, 'rgba(255,255,255,0.55)');
			}
			ctx.font = '500 15px "Noto Sans KR", sans-serif';
			ctx.fillStyle = 'rgba(255,255,255,0.72)';
			ctx.textBaseline = 'middle';
			ctx.fillText(nameText, pillX + 10 + AV + 8, pillY + pillH / 2 + 0.5);
		}
		ctx.restore();
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
	}

	// 제목 — 카드에는 곡 제목만 크게 (전체 길이는 진행바 우측에 표기)
	const titleSize = 37;
	ctx.fillStyle = '#ffffff';
	ctx.font = `700 ${titleSize}px "Noto Sans KR", sans-serif`;
	const titleText = truncate(ctx, input.title, textW);
	ctx.fillText(titleText, tx, 104);

	// ── 아티스트 / 챕터 ──
	let cursorY = 104;

	// 아티스트 — 제목 아래 작게 (없으면 생략)
	let artCursorY = cursorY;
	if (input.artist) {
		const artistY = 104 + 36;
		ctx.fillStyle = 'rgba(255,255,255,0.55)';
		ctx.font = '500 20px "Noto Sans KR", sans-serif';
		ctx.fillText(truncate(ctx, input.artist, textW - 40), tx, artistY);
		artCursorY = artistY;
	}

	if (input.chapter) {
		const chapterY = artCursorY + 38;
		// lucide 챕터 표시용 아이콘 (`corner-down-right`)
		drawIcon(ctx, 'corner-down-right', tx, chapterY - 15, 16, accent.primary);
		ctx.fillStyle = 'rgba(255,255,255,0.78)';
		ctx.font = '500 20px "Noto Sans KR", sans-serif';
		const iconPad = 24;
		const rangeText = `${truncate(ctx, input.chapter.name, textW - iconPad - 150)} (${formatClock(input.chapter.startMs)} - ${formatClock(input.chapter.endMs)})`;
		ctx.fillText(rangeText, tx + iconPad, chapterY);
		artCursorY = chapterY;
	}

	// ── 진행바 — 위치/전체 길이 (스트림은 생략) ──
	const showProgress = !input.isStream && input.durationMs > 0;
	if (showProgress) {
		const barTop = artCursorY + 44;
		const barH = 10;
		const barW = right - tx;
		const ratio = Math.max(0, Math.min(1, input.positionMs / input.durationMs));
		ctx.beginPath();
		ctx.roundRect(tx, barTop, barW, barH, barH / 2);
		ctx.fillStyle = 'rgba(255,255,255,0.12)';
		ctx.fill();
		if (ratio > 0) {
			ctx.beginPath();
			ctx.roundRect(tx, barTop, Math.max(barH, Math.round(barW * ratio)), barH, barH / 2);
			ctx.fillStyle = accent.primary;
			ctx.fill();
		}
		const headX = tx + Math.round(barW * Math.min(1, Math.max(0.02, ratio)));
		ctx.beginPath();
		ctx.arc(headX, barTop + barH / 2, 8, 0, Math.PI * 2);
		ctx.fillStyle = accent.primary;
		ctx.fill();
		ctx.beginPath();
		ctx.arc(headX, barTop + barH / 2, 8, 0, Math.PI * 2);
		ctx.strokeStyle = 'rgba(13,17,23,0.85)';
		ctx.lineWidth = 2;
		ctx.stroke();
		// 시간 — 좌측 현재 위치, 우측 전체 길이
		ctx.fillStyle = 'rgba(255,255,255,0.55)';
		ctx.font = '500 15px "Noto Sans KR", sans-serif';
		ctx.fillText(formatClock(Math.min(input.positionMs, input.durationMs)), tx, barTop + barH + 22);
		ctx.textAlign = 'right';
		ctx.fillText(formatClock(input.durationMs), right, barTop + barH + 22);
		ctx.textAlign = 'left';
		cursorY = barTop + barH + 22;
	}

	// ── 다음 곡 목록 — 유저 대기열 기준, 공간이 허용되는 만큼(최대 3) ──
	const nextList = (input.nextTracks ?? []).slice(0, 3);
	if (nextList.length > 0) {
		const headerBase = (showProgress ? cursorY : artCursorY) + 38;
		drawIcon(ctx, 'list-music', tx, headerBase - 13, 16, 'rgba(255,255,255,0.5)');
		ctx.fillStyle = 'rgba(255,255,255,0.62)';
		ctx.font = '700 15px "Noto Sans KR", sans-serif';
		ctx.fillText('다음 곡', tx + 22, headerBase);
		const maxLines = Math.min(nextList.length, Math.max(0, Math.floor((H - 44 - headerBase) / 18)));
		for (let i = 0; i < maxLines; i++) {
			const lineY = headerBase + 24 + 18 * i;
			cursorY = lineY;
			const text = `${nextList[i]!.title}${nextList[i]!.artist ? ` · ${nextList[i]!.artist}` : ''}`;
			ctx.font = '600 13px "Noto Sans KR", sans-serif';
			ctx.fillStyle = `${accent.primary}cc`;
			ctx.fillText(`${i + 1}.`, tx, lineY);
			const numW = ctx.measureText(`${i + 1}.`).width;
			ctx.font = '400 15px "Noto Sans KR", sans-serif';
			ctx.fillStyle = 'rgba(255,255,255,0.72)';
			ctx.fillText(truncate(ctx, text, right - (tx + numW + 8)), tx + numW + 8, lineY);
		}
	}

	// ── 하단 메타: 대기열 + 볼륨 + 노드 — 우측 브랜드와 같은 줄, 넘치면 뒤 세그먼트부터 생략 ──
	// 메타 행은 콘텐츠 뒤에서 64px 떨어진 곳에서 하단까지 — 다음 곡이 없어 하단이 비지 않게.
	const metaY = Math.min(H - 20, Math.max(cursorY + 64, artCursorY + 128));
	type MetaSegment = { icon: IconName; text: string };
	const metaSegments: MetaSegment[] = [];
	if (input.queueCount > 0) {
		const remaining = input.queueRemainingMs > 0 ? ` · ${Math.floor(input.queueRemainingMs / 60000)}분 남음` : '';
		metaSegments.push({ icon: 'list', text: `대기열 ${input.queueCount}곡${remaining}` });
	}
	if (input.volume !== null) {
		metaSegments.push({ icon: input.volume === 0 ? 'volume-x' : input.volume < 50 ? 'volume-1' : 'volume-2', text: `볼륨 ${input.volume}%` });
	}
	if (input.nodeId) metaSegments.push({ icon: 'radio', text: `노드 ${input.nodeId}` });

	if (metaSegments.length > 0) {
		ctx.font = '700 15px "Noto Sans KR", sans-serif';
		const brandText = input.brandLine ?? '시루봇';
		const brandW = ctx.measureText(brandText).width;
		const metaMaxW = right - brandW - 36 - tx;
		// 우선순위 뒤(노드)부터 잘라요 — 최소 1세그먼트는 남긴다
		while (metaSegments.length > 1) {
			const total = metaSegments.reduce((acc, seg) => {
				ctx.font = '400 18px "Noto Sans KR", sans-serif';
				return acc + 25 + ctx.measureText(seg.text).width + 26;
			}, 0);
			if (total <= metaMaxW) break;
			metaSegments.pop();
		}
		let cx = tx;
		for (const segment of metaSegments) {
			drawIcon(ctx, segment.icon, cx, metaY - 15, 17, 'rgba(255,255,255,0.5)');
			cx += 25;
			ctx.fillStyle = 'rgba(255,255,255,0.5)';
			ctx.font = '400 18px "Noto Sans KR", sans-serif';
			ctx.fillText(segment.text, cx, metaY);
			cx += ctx.measureText(segment.text).width + 26;
		}
	} else if (!input.brandLine) {
		// 세그먼트가 없을 때의 폴백 라벨 — 브랜드가 이미 표기돼 있으면 생략해요(중복 제거).
		ctx.fillStyle = 'rgba(255,255,255,0.5)';
		ctx.font = '400 18px "Noto Sans KR", sans-serif';
		ctx.fillText('SiruBOT', tx, metaY);
	}

	// ── 푸터 브랜드: 봇 이름 + 버전/해시 (이미지에 박는다) ──
	ctx.textAlign = 'right';
	ctx.fillStyle = `${accent.primary}bf`;
	ctx.font = '700 15px "Noto Sans KR", sans-serif';
	ctx.fillText(input.brandLine ?? '시루봇', right, H - 20);

	return (await canvas.toBuffer('png')) as Buffer;
}
