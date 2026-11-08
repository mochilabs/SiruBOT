/**
 * NowPlaying 카드 렌더러 — skia-canvas로 현재 재생 곡을 투명 배경 PNG로 그려요.
 * 고정 컨트롤러 채널의 Discord 컨테이너 위에 그대로 얹히므로 배경·블러·테두리 없이
 * 정사각 아트워크 + 제목 + 아티스트 + 상태 텍스트(일시정지·봇 추천·반복) + 챕터 + 다음 곡 +
 * 하단 한 줄(브랜드줄·대기열 메타)만 그려요. 아트워크의 도미넌트 컬러는 라벨·번호·브랜드줄에만 써요.
 * 글자색은 Discord 다크 테마 기준이에요.
 *
 * 카드는 정적 — 진행바가 이미지에 들어가지 않아요. 동적 시간은 디스코드 타임스탬프로
 * 커버돼요. 갱신 주기는 봇이 트랙/볼륨/챕터/일시정지/반복 변경을 감지해 다시 렌더.
 */
import type { Canvas, CanvasDrawable, CanvasRenderingContext2D } from 'skia-canvas';
import { BOT_NAME } from '@sirubot/utils';
import { drawCircleImage, drawIcon, ensureKoreanFont, formatClock, hashString, loadImageAllowed, truncate } from './canvasUtils.ts';

export interface NowPlayingCardInput {
	/** 캐시/dedup 키 — lavalink track.info.identifier */
	trackId: string;
	title: string;
	/** 아티스트 — 제목 아래 표기해요 */
	artist: string;
	/** 아트워크 URL — data-api가 fetch해요. 실패하면 폴백 아트워크를 그려요 */
	artworkUrl: string | null;
	/** 재생 위치(ms) — 이미지에는 표시하지 않고 스키마 호환용으로 유지해요 */
	positionMs: number;
	/** 전체 길이(ms) — 스트림·챕터 여부 판별용 */
	durationMs: number;
	isStream: boolean;
	/** 일시정지 상태 — 일시정지 뱃지를 박아요 */
	isPaused?: boolean;
	/** 반복 모드 — off가 아니면 상단에 반복 뱃지로 표기해요 */
	repeatMode?: 'off' | 'track' | 'queue';
	/** 현재 곡이 봇 추천(related) 곡인지 — 봇 추천 뱃지를 박아요 */
	isRecommended?: boolean;
	/** 다음 곡 목록(유저 대기열 기준) — 공간이 허용되는 만큼(최대 3) 그려요 */
	nextTracks?: Array<{ title: string; artist: string | null }>;
	/** 하단 메타 — 카드에 박아요 */
	queueCount: number;
	/** 대기열 전체 남은 시간(ms) — 0이면 미표기 */
	queueRemainingMs: number;
	/** 볼륨(%) — 브랜드줄(brandLine)에 통합되어 렌더러에서는 미사용 (스키마/타입 호환용으로 유지) */
	volume: number | null;
	/** 노드 ID — 브랜드줄(brandLine)에 통합되어 렌더러에서는 미사용 (스키마/타입 호환용으로 유지) */
	nodeId: string | null;
	/** 브랜드 줄 (노드·볼륨·봇 이름 + 버전/해시) */
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

const FONT = '"Pretendard JP", "Twemoji Mozilla", sans-serif';
const TEXT = '#f2f3f5';
const MUTED = '#949ba4';

/**
 * 썸네일 가장자리의 검은 띠(레터박스·필러박스) 영역을 잘라낸 원본 좌표를 돌려줘요.
 * YouTube 썸네일은 4:3 영상이 16:9 틀 안에 검은 띠로 들어 있는 경우가 많아서, 그대로 cover하면 띠가 보여요.
 * 잘라낸 결과가 원본의 40% 미만이면(어두운 아트워크) 자르지 않아요.
 */
export async function contentBounds(img: CanvasDrawable): Promise<{ sx: number; sy: number; sw: number; sh: number }> {
	const iw = (img as { width: number }).width;
	const ih = (img as { height: number }).height;
	const full = { sx: 0, sy: 0, sw: iw, sh: ih };
	if (!iw || !ih) return full;
	try {
		const { Canvas } = await import('skia-canvas');
		const probe: Canvas = new Canvas(iw, ih);
		const pctx = probe.getContext('2d');
		pctx.drawImage(img, 0, 0);
		const { data } = pctx.getImageData(0, 0, iw, ih);
		const dark = (x: number, y: number) => {
			const i = (y * iw + x) * 4;
			return (data[i]! + data[i + 1]! + data[i + 2]!) / 3 < 14;
		};
		const lineDark = (fixed: number, length: number, vertical: boolean) => {
			let count = 0;
			for (let k = 0; k < length; k += 2) if (vertical ? dark(fixed, k) : dark(k, fixed)) count++;
			return count / Math.ceil(length / 2) > 0.97;
		};
		let top = 0;
		let bottom = ih - 1;
		let left = 0;
		let right = iw - 1;
		while (top < bottom && lineDark(top, iw, false)) top++;
		while (bottom > top && lineDark(bottom, iw, false)) bottom--;
		while (left < right && lineDark(left, ih, true)) left++;
		while (right > left && lineDark(right, ih, true)) right--;
		const sw = right - left + 1;
		const sh = bottom - top + 1;
		if (sw * sh < iw * ih * 0.4) return full;
		return { sx: left, sy: top, sw, sh };
	} catch {
		return full;
	}
}

/** 아트워크를 정사각 영역에 cover-fit(검은 띠 제거 후 가운데 정사각) */
async function drawSquareArtwork(
	ctx: CanvasRenderingContext2D,
	img: CanvasDrawable,
	x: number,
	y: number,
	size: number,
	radius: number
): Promise<void> {
	const { sx, sy, sw, sh } = await contentBounds(img);
	const side = Math.min(sw, sh);
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(x, y, size, size, radius);
	ctx.clip();
	ctx.drawImage(img, sx + (sw - side) / 2, sy + (sh - side) / 2, side, side, x, y, size, size);
	ctx.restore();
}

/** 아트워크 없을 때 폴백 — 단색 면 위의 동심원(바이닐) */
function drawArtworkFallback(ctx: CanvasRenderingContext2D, accent: { primary: string }, x: number, y: number, size: number, radius: number): void {
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(x, y, size, size, radius);
	ctx.clip();
	ctx.fillStyle = 'rgba(255,255,255,0.06)';
	ctx.fillRect(x, y, size, size);
	const cx = x + size / 2;
	const cy = y + size / 2;
	for (let r = size * 0.44; r > size * 0.1; r -= size * 0.07) {
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.strokeStyle = 'rgba(255,255,255,0.1)';
		ctx.lineWidth = 2;
		ctx.stroke();
	}
	ctx.beginPath();
	ctx.arc(cx, cy, size * 0.1, 0, Math.PI * 2);
	ctx.fillStyle = accent.primary;
	ctx.fill();
	ctx.restore();
}

/** 텍스트를 최대 maxLines 줄로 줄바꿈 — 공백이 있으면 단어 단위로, 없으면(한·일 문장) 글자 단위로 끊고 마지막 줄이 넘치면 말줄임표로 잘라요 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
	if (maxLines <= 0 || !text) return [];
	const fits = (value: string) => ctx.measureText(value).width <= maxWidth;
	if (fits(text)) return [text];
	if (maxLines === 1) return [truncate(ctx, text, maxWidth)];

	const lines: string[] = [];
	let rest = text;
	while (lines.length < maxLines - 1 && rest.length > 0) {
		if (fits(rest)) break;
		// 들어가는 가장 긴 접두를 찾고, 그 안에서 마지막 공백에서 끊어요(공백이 너무 앞이면 글자 단위)
		let cut = rest.length;
		while (cut > 1 && !fits(rest.slice(0, cut))) cut--;
		const space = rest.lastIndexOf(' ', cut);
		if (space > cut * 0.5) cut = space;
		lines.push(rest.slice(0, cut).trimEnd());
		rest = rest.slice(cut).trimStart();
	}
	if (rest) lines.push(fits(rest) ? rest : truncate(ctx, rest, maxWidth));
	return lines;
}

export async function renderNowPlayingCard(input: NowPlayingCardInput): Promise<Buffer> {
	const { Canvas } = await import('skia-canvas');
	await ensureKoreanFont();

	const W = 960;
	const H = 300;
	const PAD = 16;
	const canvas: Canvas = new Canvas(W, H);
	const ctx = canvas.getContext('2d');

	const artImg = input.artworkUrl ? await loadImageAllowed(input.artworkUrl) : null;
	let accent: { primary: string };
	if (artImg) {
		const dominant = await extractDominantColorAsync(artImg);
		accent = dominant ? { primary: normalizeAccent(dominant) } : fallbackAccent(input.trackId);
	} else {
		accent = fallbackAccent(input.trackId);
	}

	// 아트워크: 정사각 200px, 라벨 줄과 윗선을 맞춰요
	const ART = 200;
	const artY = 18;
	if (artImg) await drawSquareArtwork(ctx, artImg, PAD, artY, ART, 14);
	else drawArtworkFallback(ctx, accent, PAD, artY, ART, 14);

	const tx = PAD + ART + 28;
	const right = W - PAD;
	const textW = right - tx;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	// 상단 줄: "재생 중" + 상태 텍스트(LIVE · 일시정지 · 봇 추천 · 반복). 알약 대신 구분점으로 이어요.
	const flags: Array<{ text: string; color: string }> = [];
	if (input.isStream) flags.push({ text: 'LIVE', color: '#f23f43' });
	if (input.isPaused) flags.push({ text: '일시정지', color: MUTED });
	if (input.isRecommended) flags.push({ text: '봇 추천', color: MUTED });
	if (input.repeatMode === 'track') flags.push({ text: '반복: 현재 곡', color: MUTED });
	else if (input.repeatMode === 'queue') flags.push({ text: '반복: 대기열', color: MUTED });

	let labelX = tx;
	ctx.font = `800 17px ${FONT}`;
	ctx.fillStyle = accent.primary;
	ctx.fillText('재생 중', labelX, 34);
	labelX += ctx.measureText('재생 중').width;
	let labelEnd = labelX;
	for (const flag of flags) {
		ctx.font = `600 17px ${FONT}`;
		ctx.fillStyle = MUTED;
		ctx.fillText(' · ', labelX, 34);
		labelX += ctx.measureText(' · ').width;
		ctx.fillStyle = flag.color;
		ctx.fillText(flag.text, labelX, 34);
		labelX += ctx.measureText(flag.text).width;
		labelEnd = labelX;
	}

	// 신청자: 상단 우측에 작은 아바타 + 이름 (상단 줄과 겹치면 생략, 텍스트 라인 멘션이 폴백)
	if (input.requester?.name) {
		const reqImg = input.requester.avatarUrl ? await loadImageAllowed(input.requester.avatarUrl) : null;
		ctx.font = `600 17px ${FONT}`;
		const AV = 24;
		const nameW = ctx.measureText(input.requester.name).width;
		const blockW = AV + 8 + nameW;
		const blockX = right - blockW;
		if (blockX > labelEnd + 24) {
			if (reqImg) {
				drawCircleImage(ctx, reqImg, blockX + AV / 2, 27, AV / 2);
			} else {
				ctx.beginPath();
				ctx.arc(blockX + AV / 2, 27, AV / 2, 0, Math.PI * 2);
				ctx.fillStyle = 'rgba(255,255,255,0.12)';
				ctx.fill();
				drawIcon(ctx, 'users', blockX + AV / 2 - 7, 20, 14, MUTED);
			}
			ctx.fillStyle = MUTED;
			ctx.fillText(input.requester.name, blockX + AV + 8, 34);
		}
	}

	// 제목: 최대 2줄
	ctx.fillStyle = TEXT;
	ctx.font = `800 38px ${FONT}`;
	const titleLines = wrapText(ctx, input.title, textW, 2);
	let y = 84;
	for (const line of titleLines) {
		ctx.fillText(line, tx, y);
		y += 44;
	}
	y -= 44;

	// 아티스트
	if (input.artist) {
		y += 36;
		ctx.fillStyle = MUTED;
		ctx.font = `600 22px ${FONT}`;
		ctx.fillText(truncate(ctx, input.artist, textW), tx, y);
	}

	// 챕터
	if (input.chapter) {
		y += 34;
		drawIcon(ctx, 'corner-down-right', tx, y - 16, 18, accent.primary);
		ctx.fillStyle = TEXT;
		ctx.font = `600 19px ${FONT}`;
		const range = `${input.chapter.name} (${formatClock(input.chapter.startMs)} - ${formatClock(input.chapter.endMs)})`;
		ctx.fillText(truncate(ctx, range, textW - 28), tx + 28, y);
	}

	// 다음 곡: 하단 줄(H-34) 위에 들어가는 만큼만
	const FOOT_Y = H - 18;
	const nextList = (input.nextTracks ?? []).slice(0, 3);
	if (nextList.length > 0) {
		const headerY = y + 38;
		const rows = Math.min(nextList.length, Math.max(0, Math.floor((FOOT_Y - 30 - headerY) / 25)));
		if (rows > 0) {
			ctx.fillStyle = MUTED;
			ctx.font = `700 15px ${FONT}`;
			ctx.fillText('다음 곡', tx, headerY);
			for (let i = 0; i < rows; i++) {
				const lineY = headerY + 26 + 25 * i;
				ctx.font = `700 15px ${FONT}`;
				ctx.fillStyle = accent.primary;
				ctx.fillText(`${i + 1}`, tx, lineY);
				ctx.font = `500 17px ${FONT}`;
				ctx.fillStyle = TEXT;
				const text = `${nextList[i]!.title}${nextList[i]!.artist ? ` · ${nextList[i]!.artist}` : ''}`;
				ctx.fillText(truncate(ctx, text, textW - 24), tx + 20, lineY);
			}
		}
	}

	// 하단 한 줄: 브랜드줄(좌) + 대기열 메타(우). 같은 베이스라인이라 겹치지 않게 폭을 나눠요.
	ctx.font = `500 15px ${FONT}`;
	let metaW = 0;
	if (input.queueCount > 0) {
		const remaining = input.queueRemainingMs > 0 ? ` (${Math.floor(input.queueRemainingMs / 60000)}분 남음)` : '';
		const meta = `대기열 ${input.queueCount}곡${remaining}`;
		metaW = ctx.measureText(meta).width;
		ctx.textAlign = 'right';
		ctx.fillStyle = MUTED;
		ctx.fillText(meta, right, FOOT_Y);
		ctx.textAlign = 'left';
	}
	ctx.fillStyle = MUTED;
	ctx.fillText(truncate(ctx, input.brandLine ?? BOT_NAME, textW - metaW - (metaW > 0 ? 24 : 0)), tx, FOOT_Y);

	return (await canvas.toBuffer('png')) as Buffer;
}
