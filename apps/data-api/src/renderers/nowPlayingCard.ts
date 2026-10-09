/**
 * NowPlaying 카드 렌더러 — skia-canvas로 현재 재생 곡을 카드 이미지로 그려요.
 * 아트워크 + 아티스트 + 제목 + 챕터/신청자 뱃지 + 하단 메타(대기열/볼륨/노드) + 브랜드(봇이름/버전).
 * 배경 액센트는 아트워크에서 도미넌트 컬러를 추출해요 (실패 시 해시 기반 프리셋).
 * 프로그레스바는 이미지에 박지 않아요 — 매 업데이트로 갱신해야 하는 동적 정보는
 * 봇의 텍스트 라인(이모지 프로그레스바)이 담당하고, 카드는 트랙당 1회만 렌더돼요.
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
	/** 진행바는 카드에 없음 — 하위 호환용 입력 유지 (미사용) */
	positionMs: number;
	durationMs: number;
	isStream: boolean;
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
	/** 신청자 — 있으면 카드에 아바타 + 이름을 박아요 */
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

export async function renderNowPlayingCard(input: NowPlayingCardInput): Promise<Buffer> {
	const { Canvas } = await import('skia-canvas');
	await ensureKoreanFont();

	const W = 960;
	const H = 300;
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

	// 신청자 정보 — 렌더는 푸터 위 뱃지에서 진행 (상단엔 자리만 계산용으로 로드)
	const reqImg = input.requester?.avatarUrl ? await loadImageAllowed(input.requester.avatarUrl) : null;
	const hasRequester = Boolean(input.requester?.name);

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

	// 제목 — 카드에는 곡 제목만 크게 (아티스트는 텍스트 라인 담당)
	const titleSize = 37;
	ctx.fillStyle = '#ffffff';
	ctx.font = `700 ${titleSize}px "Noto Sans KR", sans-serif`;
	const titleText = input.isStream ? truncate(ctx, input.title, textW) : truncate(ctx, input.title, textW - 110);
	const titleW = ctx.measureText(titleText).width;
	ctx.fillText(titleText, tx, 104);

	// 곡 길이 — 제목 오른쪽 작은 칩 (포지션은 카드에 박지 않아 업데이트 불필요)
	if (!input.isStream && input.durationMs > 0) {
		const lengthY = 104;
		ctx.save();
		ctx.font = '500 17px "Noto Sans KR", sans-serif';
		const lengthText = formatClock(input.durationMs);
		const lw = ctx.measureText(lengthText).width + 24;
		const lx = tx + titleW + 18;
		ctx.beginPath();
		ctx.roundRect(lx, lengthY - 21, lw, 27, 13);
		ctx.fillStyle = 'rgba(255,255,255,0.09)';
		ctx.fill();
		ctx.beginPath();
		ctx.roundRect(lx, lengthY - 21, lw, 27, 13);
		ctx.strokeStyle = 'rgba(255,255,255,0.14)';
		ctx.lineWidth = 1;
		ctx.stroke();
		ctx.fillStyle = 'rgba(255,255,255,0.62)';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(lengthText, lx + lw / 2, lengthY - 7);
		ctx.restore();
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
	}

	// ── 챕터 라인 — 챕터가 있으면 현재 구간을 표시해요 ──
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
		cursorY = chapterY;
		// lucide 챕터 표시용 아이콘 (`corner-down-right`)
		drawIcon(ctx, 'corner-down-right', tx, chapterY - 15, 16, accent.primary);
		ctx.fillStyle = 'rgba(255,255,255,0.78)';
		ctx.font = '500 20px "Noto Sans KR", sans-serif';
		const iconPad = 24;
		const rangeText = `${truncate(ctx, input.chapter.name, textW - iconPad - 150)} (${formatClock(input.chapter.startMs)} - ${formatClock(input.chapter.endMs)})`;
		ctx.fillText(rangeText, tx + iconPad, chapterY);
	}

	// ── 하단 메타 기준선 — 신청자 뱃지가 참고하므로 먼저 계산 ──
	const metaY = Math.max(262, cursorY + 84);

	// ── 신청자 뱃지 — 푸터 위, 아바타 + 닉네임 pill ──
	// 레이아웃: 하단 메타 위쪽 (metaY - 46)에 오른쪽 정렬. 대기열/볼륨/노드 메타와 겹치지 않게.
	if (hasRequester) {
		const badgeY = metaY - 48;
		const badgeH = 36;
		ctx.save();
		ctx.font = '500 17px "Noto Sans KR", sans-serif';
		const nameText = truncate(ctx, input.requester!.name, 140);
		const nameW = ctx.measureText(nameText).width;
		const AV = 24;
		const badgeW = AV + 12 + nameW + 18;
		const badgeX = right - badgeW;
		ctx.beginPath();
		ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
		ctx.fillStyle = 'rgba(255,255,255,0.07)';
		ctx.fill();
		ctx.beginPath();
		ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
		ctx.strokeStyle = 'rgba(255,255,255,0.12)';
		ctx.lineWidth = 1;
		ctx.stroke();
		if (reqImg) {
			drawCircleImage(ctx, reqImg, badgeX + badgeH / 2, badgeY + badgeH / 2, AV / 2);
		} else {
			// 폴백: lucide 유저 아이콘
			ctx.beginPath();
			ctx.arc(badgeX + badgeH / 2, badgeY + badgeH / 2, AV / 2, 0, Math.PI * 2);
			ctx.fillStyle = 'rgba(255,255,255,0.1)';
			ctx.fill();
			drawIcon(ctx, 'users', badgeX + badgeH / 2 - 8, badgeY + badgeH / 2 - 8, 16, 'rgba(255,255,255,0.55)');
		}
		ctx.fillStyle = 'rgba(255,255,255,0.68)';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.fillText(nameText, badgeX + AV + 10, badgeY + badgeH / 2 + 1);
		ctx.restore();
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
	}

	// ── 하단 메타: 대기열 + 볼륨 + 노드 — 각 세그먼트 앞에 lucide 아이콘 ──
	type MetaSegment = { icon: IconName; text: string };
	const segments: MetaSegment[] = [];
	if (input.queueCount > 0) {
		const remaining = input.queueRemainingMs > 0 ? ` · ${Math.floor(input.queueRemainingMs / 60000)}분 남음` : '';
		segments.push({ icon: 'list', text: `대기열 ${input.queueCount}곡${remaining}` });
	}
	if (input.volume !== null) {
		segments.push({ icon: input.volume === 0 ? 'volume-x' : input.volume < 50 ? 'volume-1' : 'volume-2', text: `볼륨 ${input.volume}%` });
	}
	if (input.nodeId) segments.push({ icon: 'radio', text: `노드 ${input.nodeId}` });

	if (segments.length > 0) {
		const ICON = 17;
		const PAD = 25;
		let cx = tx;
		for (const segment of segments) {
			drawIcon(ctx, segment.icon, cx, metaY - 15, ICON, 'rgba(255,255,255,0.5)');
			cx += PAD;
			ctx.fillStyle = 'rgba(255,255,255,0.5)';
			ctx.font = '400 18px "Noto Sans KR", sans-serif';
			ctx.fillText(segment.text, cx, metaY);
			cx += ctx.measureText(segment.text).width + 26;
		}
	} else {
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
