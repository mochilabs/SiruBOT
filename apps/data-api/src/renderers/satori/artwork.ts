/**
 * 아트워크 처리 — 썸네일에서 레터박스를 잘라낸 정사각 이미지, 카드 배경용 초소형 이미지, 대표색을 뽑아요.
 * 전부 resvg의 `<image>` 렌더로 처리해서 skia·sharp 없이 동작해요 (satori 카드 전용).
 * resvg-js 2.6은 webp를 못 읽어서 png/jpeg/gif만 받아요 (fetchImageDataUri가 그 밖은 null로 돌려요).
 */
import { loadResvg } from './satoriKit.ts';

export interface PreparedArtwork {
	/** 레터박스를 잘라낸 정사각 PNG data URI (satori `<img>`에 그대로 써요) */
	art: string;
	/** 카드 배경용 160x100 PNG data URI — 작은 크기에서 한 번 블러해 둬서 카드 크기로 키워도 매끈한 색 번짐이 돼요 (큰 이미지에 블러 필터를 걸면 비싸요). 비율은 유지하고 카드 쪽에서 cover로 맞춰요. */
	backdrop: string;
	/** 카드에서 안전하게 쓸 수 있는 밝기로 보정한 대표색 `#rrggbb` */
	accent: string | null;
}

/** 원본 좌표계의 자를 영역 */
export interface CropBox {
	sx: number;
	sy: number;
	sw: number;
	sh: number;
}

export const BACKDROP_SIZE = { width: 160, height: 100 } as const;
/** 160x100 기준 가우시안 표준편차 — 카드 폭(960)에서 약 6배 크기로 보여요 */
const BACKDROP_BLUR = 6;
const PROBE_WIDTH = 96;

/** rgb → '#rrggbb' */
function rgbToHex(r: number, g: number, b: number): string {
	const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
	return `#${((1 << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).slice(1)}`;
}

/**
 * 썸네일 가장자리의 검은 띠를 잘라낸 영역을 구해요. YouTube 썸네일은 영상 비율이 다르면 위아래·좌우에 검은 띠가 들어가서
 * 그대로 cover하면 띠가 보여요. 잘라낸 결과가 원본의 40% 미만이면(어두운 아트워크) 자르지 않아요.
 * pixels는 RGBA(w*h*4)예요. 반환은 0..w, 0..h 좌표 (right/bottom은 포함하지 않는 끝)예요.
 */
export function detectContentBounds(pixels: Uint8Array, w: number, h: number): { left: number; top: number; right: number; bottom: number } {
	const full = { left: 0, top: 0, right: w, bottom: h };
	if (w < 4 || h < 4 || pixels.length < w * h * 4) return full;
	const dark = (x: number, y: number) => {
		const i = (y * w + x) * 4;
		return (pixels[i]! + pixels[i + 1]! + pixels[i + 2]!) / 3 < 14;
	};
	const rowDark = (y: number) => {
		let count = 0;
		for (let x = 0; x < w; x++) if (dark(x, y)) count++;
		return count / w > 0.97;
	};
	const colDark = (x: number) => {
		let count = 0;
		for (let y = 0; y < h; y++) if (dark(x, y)) count++;
		return count / h > 0.97;
	};
	let top = 0;
	let bottom = h - 1;
	let left = 0;
	let right = w - 1;
	while (top < bottom && rowDark(top)) top++;
	while (bottom > top && rowDark(bottom)) bottom--;
	while (left < right && colDark(left)) left++;
	while (right > left && colDark(right)) right--;
	const cw = right - left + 1;
	const ch = bottom - top + 1;
	if (cw * ch < w * h * 0.4) return full;
	return { left, top, right: right + 1, bottom: bottom + 1 };
}

/** 대표색 — 채도 가중 평균과 가장 무게가 큰 픽셀을 섞어요. 채도 있는 픽셀이 없으면 평균색이에요. 투명뿐이면 null이에요. */
export function dominantColor(pixels: Uint8Array): string | null {
	let bestR = 0;
	let bestG = 0;
	let bestB = 0;
	let bestWeight = 0;
	let sumR = 0;
	let sumG = 0;
	let sumB = 0;
	let sumW = 0;
	let accR = 0;
	let accG = 0;
	let accB = 0;
	let count = 0;
	for (let i = 0; i + 3 < pixels.length; i += 4) {
		const r = pixels[i]!;
		const g = pixels[i + 1]!;
		const b = pixels[i + 2]!;
		if (pixels[i + 3]! < 200) continue;
		accR += r;
		accG += g;
		accB += b;
		count++;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const saturation = max === 0 ? 0 : (max - min) / max;
		const lightness = (max + min) / 2 / 255;
		// 너무 밝거나(흰 배경) 어둡거나(검은 배경) 무채색이면 가중치를 크게 깎아요
		const weight = Math.max(0, saturation * (1 - Math.abs(lightness - 0.55) * 1.6));
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
	if (count === 0) return null;
	if (sumW <= 0.0001) return rgbToHex(accR / count, accG / count, accB / count);
	return rgbToHex((sumR / sumW) * 0.6 + bestR * 0.4, (sumG / sumW) * 0.6 + bestG * 0.4, (sumB / sumW) * 0.6 + bestB * 0.4);
}

/** 어두운 카드 위 텍스트·칩에 쓸 수 있게 밝기를 보정해요 — 너무 어두우면 밝히고, 너무 밝으면 어둡게 해요. */
export function normalizeAccent(hex: string): string {
	const n = parseInt(hex.slice(1), 16);
	let r = (n >> 16) & 255;
	let g = (n >> 8) & 255;
	let b = n & 255;
	const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
	if (luma < 0.25) {
		const k = (0.55 - luma) / (1 - luma);
		r += (255 - r) * k * 0.9;
		g += (255 - g) * k * 0.9;
		b += (255 - b) * k * 0.9;
	} else if (luma > 0.82) {
		r *= 0.55;
		g *= 0.55;
		b *= 0.55;
	}
	return rgbToHex(r, g, b);
}

/** 두 색을 섞어요 — t=0이면 a, t=1이면 b */
export function mixHex(a: string, b: string, t: number): string {
	const pa = parseInt(a.slice(1), 16);
	const pb = parseInt(b.slice(1), 16);
	const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
	return rgbToHex(ch(16), ch(8), ch(0));
}

/** `#rrggbb` → `rgba(r, g, b, a)` */
export function hexToRgba(hex: string, alpha: number): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** data URI를 `<image>`로 넣은 SVG를 만들어요 — resvg가 자르기·축소·확대를 한꺼번에 해줘요. */
function imageSvg(
	uri: string,
	attrs: { width: number; height: number; viewBox?: string; aspect: string },
	image: { width: number; height: number }
): string {
	const viewBox = attrs.viewBox ? ` viewBox="${attrs.viewBox}"` : '';
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${attrs.width}" height="${attrs.height}"${viewBox} preserveAspectRatio="${attrs.aspect}">` +
		`<image href="${uri}" x="0" y="0" width="${image.width}" height="${image.height}" preserveAspectRatio="none"/></svg>`
	);
}

/** 배경용 SVG — 이미지를 캔버스보다 조금 크게 깔고 블러해서 가장자리가 투명하게 번지지 않게 해요. */
function backdropSvg(uri: string, viewBox: string, image: { width: number; height: number }): string {
	const { width, height } = BACKDROP_SIZE;
	const m = BACKDROP_BLUR * 3;
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
		`<defs><filter id="b" x="0" y="0" width="100%" height="100%"><feGaussianBlur stdDeviation="${BACKDROP_BLUR}"/></filter></defs>` +
		`<svg x="${-m}" y="${-m}" width="${width + m * 2}" height="${height + m * 2}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice" filter="url(#b)">` +
		`<image href="${uri}" x="0" y="0" width="${image.width}" height="${image.height}" preserveAspectRatio="none"/></svg></svg>`
	);
}

const toDataUri = (png: Uint8Array) => `data:image/png;base64,${Buffer.from(png).toString('base64')}`;

/**
 * 썸네일 data URI에서 카드용 이미지 3종을 만들어요. 읽을 수 없는 이미지면 null이라 호출부가 폴백 배경을 그려요.
 * @param artSize 정사각 아트워크 한 변(px)
 */
export async function prepareArtwork(dataUri: string | null, artSize: number): Promise<PreparedArtwork | null> {
	if (!dataUri) return null;
	try {
		const Resvg = await loadResvg();
		const opts = { font: { loadSystemFonts: false } };
		// 1) 자연 크기 — width/height 없는 <image>를 그리면 viewport가 이미지 크기가 돼요.
		const natural = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg"><image href="${dataUri}"/></svg>`, opts);
		const nw = natural.width;
		const nh = natural.height;
		if (!nw || !nh || nw < 4 || nh < 4) return null;

		// 2) 가장자리 검은 띠 감지용 초소형 래스터 (비율 유지, 너비 96)
		const pw = Math.min(PROBE_WIDTH, nw);
		const ph = Math.max(4, Math.round((pw * nh) / nw));
		const probe = new Resvg(imageSvg(dataUri, { width: pw, height: ph, aspect: 'none' }, { width: pw, height: ph }), opts).render();
		// 디코딩에 실패한 이미지(미지원 형식 등)는 resvg가 아무것도 안 그려서 알파가 전부 0이에요.
		if (!probe.pixels.some((v, i) => i % 4 === 3 && v > 0)) return null;
		const bounds = detectContentBounds(probe.pixels, pw, ph);
		const crop: CropBox = {
			sx: (bounds.left / pw) * nw,
			sy: (bounds.top / ph) * nh,
			sw: ((bounds.right - bounds.left) / pw) * nw,
			sh: ((bounds.bottom - bounds.top) / ph) * nh
		};
		const viewBox = `${crop.sx} ${crop.sy} ${crop.sw} ${crop.sh}`;

		// 3) 정사각 아트워크 (cover)와 4) 배경용 초소형 이미지 (늘려서 전체 색 번짐)
		const art = new Resvg(
			imageSvg(dataUri, { width: artSize, height: artSize, viewBox, aspect: 'xMidYMid slice' }, { width: nw, height: nh }),
			opts
		).render();
		const back = new Resvg(backdropSvg(dataUri, viewBox, { width: nw, height: nh }), opts).render();
		const dominant = dominantColor(back.pixels);
		return { art: toDataUri(art.asPng()), backdrop: toDataUri(back.asPng()), accent: dominant ? normalizeAccent(dominant) : null };
	} catch {
		return null;
	}
}
