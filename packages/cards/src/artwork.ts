export interface PreparedArtwork {
	art: string;
	backdrop: string;
	accent: string | null;
}

export interface CropBox {
	sx: number;
	sy: number;
	sw: number;
	sh: number;
}

export const BACKDROP_SIZE = { width: 160, height: 100 } as const;

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

function rgbToHex(r: number, g: number, b: number): string {
	const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
	return `#${((1 << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).slice(1)}`;
}

/** Strips letterbox bars from RGBA pixels (exclusive right/bottom); skips if <40% would remain. */
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

export function mixHex(a: string, b: string, t: number): string {
	const pa = parseInt(a.slice(1), 16);
	const pb = parseInt(b.slice(1), 16);
	const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
	return rgbToHex(ch(16), ch(8), ch(0));
}

export function hexToRgba(hex: string, alpha: number): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
