/**
 * 아트워크 순수 헬퍼 — 레터박스 감지, 대표색, 색 섞기, 이미지 헤더 크기 읽기예요. 런타임 독립(node·브라우저 공용)이에요.
 * 래스터가 필요한 `prepareArtwork`(Takumi)는 data-api `renderers/takumi/artwork.ts`에 있어요.
 */

export interface PreparedArtwork {
	/** 레터박스를 잘라낸 정사각 PNG data URI (Takumi `<img>`에 그대로 써요) */
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

/**
 * PNG·GIF·JPEG·WebP 헤더에서 크기만 읽어요 (디코딩 없이). 렌더러로 자연 크기를 재면 이미지를 통째로 디코딩해서 느려요.
 * 알 수 없는 형식이면 null이에요.
 */
export function imageSizeOf(buf: Uint8Array): { width: number; height: number } | null {
	if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
		return {
			width: ((buf[16]! << 24) | (buf[17]! << 16) | (buf[18]! << 8) | buf[19]!) >>> 0,
			height: ((buf[20]! << 24) | (buf[21]! << 16) | (buf[22]! << 8) | buf[23]!) >>> 0
		};
	}
	if (buf.length > 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
		return { width: buf[6]! | (buf[7]! << 8), height: buf[8]! | (buf[9]! << 8) };
	}
	if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
		let i = 2;
		while (i + 9 < buf.length) {
			if (buf[i] !== 0xff) {
				i += 1;
				continue;
			}
			const marker = buf[i + 1]!;
			if (marker === 0xff) {
				i += 1;
				continue;
			}
			if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
				i += 2;
				continue;
			}
			// SOF0~SOF15 (DHT 0xc4, JPG 0xc8, DAC 0xcc 제외) — 높이·너비가 들어 있어요
			if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
				return { height: (buf[i + 5]! << 8) | buf[i + 6]!, width: (buf[i + 7]! << 8) | buf[i + 8]! };
			}
			i += 2 + ((buf[i + 2]! << 8) | buf[i + 3]!);
		}
	}
	// WebP — RIFF....WEBP 뒤 청크(VP8 손실 / VP8L 무손실 / VP8X 확장)에서 크기를 읽어요
	if (
		buf.length > 30 &&
		buf[0] === 0x52 &&
		buf[1] === 0x49 &&
		buf[2] === 0x46 &&
		buf[3] === 0x46 &&
		buf[8] === 0x57 &&
		buf[9] === 0x45 &&
		buf[10] === 0x42 &&
		buf[11] === 0x50
	) {
		const chunk = String.fromCharCode(buf[12]!, buf[13]!, buf[14]!, buf[15]!);
		if (chunk === 'VP8X') {
			return {
				width: 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16)),
				height: 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16))
			};
		}
		if (chunk === 'VP8L' && buf[20] === 0x2f) {
			const bits = (buf[21]! | (buf[22]! << 8) | (buf[23]! << 16) | (buf[24]! << 24)) >>> 0;
			return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
		}
		if (chunk === 'VP8 ' && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
			return { width: (buf[26]! | (buf[27]! << 8)) & 0x3fff, height: (buf[28]! | (buf[29]! << 8)) & 0x3fff };
		}
	}
	return null;
}

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
