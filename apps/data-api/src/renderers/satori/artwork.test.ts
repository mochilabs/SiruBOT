import { describe, expect, it } from 'vitest';
import { detectContentBounds, dominantColor, hexToRgba, imageSizeOf, mixHex, normalizeAccent, prepareArtwork } from './artwork.ts';
import { createAsyncLru, loadResvg } from './satoriKit.ts';

/** w×h RGBA 버퍼 — fill(x, y)가 [r,g,b,a]를 돌려줘요. */
function pixels(w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]): Uint8Array {
	const out = new Uint8Array(w * h * 4);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.set(fill(x, y), (y * w + x) * 4);
	return out;
}

describe('detectContentBounds', () => {
	it('crops black bars at the top and bottom', () => {
		const px = pixels(40, 30, (_x, y) => (y < 5 || y >= 25 ? [0, 0, 0, 255] : [200, 120, 80, 255]));
		expect(detectContentBounds(px, 40, 30)).toEqual({ left: 0, top: 5, right: 40, bottom: 25 });
	});
	it('crops black bars at the sides', () => {
		const px = pixels(40, 30, (x) => (x < 8 || x >= 32 ? [0, 0, 0, 255] : [90, 160, 220, 255]));
		expect(detectContentBounds(px, 40, 30)).toEqual({ left: 8, top: 0, right: 32, bottom: 30 });
	});
	it('does not crop an artwork that is mostly dark (keeps at least 40%)', () => {
		const px = pixels(40, 30, (_x, y) => (y < 20 ? [0, 0, 0, 255] : [200, 200, 200, 255]));
		expect(detectContentBounds(px, 40, 30)).toEqual({ left: 0, top: 0, right: 40, bottom: 30 });
	});
	it('leaves a normal image alone', () => {
		const px = pixels(40, 30, () => [120, 130, 140, 255]);
		expect(detectContentBounds(px, 40, 30)).toEqual({ left: 0, top: 0, right: 40, bottom: 30 });
	});
});

describe('colors', () => {
	it('dominantColor prefers saturated pixels over gray background', () => {
		const px = pixels(20, 20, (x) => (x < 14 ? [128, 128, 128, 255] : [230, 40, 60, 255]));
		const hex = dominantColor(px)!;
		const n = parseInt(hex.slice(1), 16);
		expect((n >> 16) & 255).toBeGreaterThan(180); // 빨강 쪽
		expect(n & 255).toBeLessThan(120);
	});
	it('dominantColor falls back to the average for gray images and null for transparent ones', () => {
		expect(dominantColor(pixels(4, 4, () => [100, 100, 100, 255]))).toBe('#646464');
		expect(dominantColor(pixels(4, 4, () => [0, 0, 0, 0]))).toBeNull();
	});
	it('normalizeAccent lightens very dark colors and darkens very light ones', () => {
		const luma = (hex: string) => {
			const n = parseInt(hex.slice(1), 16);
			return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
		};
		expect(luma(normalizeAccent('#101010'))).toBeGreaterThan(0.3);
		expect(luma(normalizeAccent('#fafafa'))).toBeLessThan(0.82);
		expect(normalizeAccent('#4488cc')).toBe('#4488cc');
	});
	it('mixHex and hexToRgba', () => {
		expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
		expect(mixHex('#102030', '#102030', 0.7)).toBe('#102030');
		expect(hexToRgba('#ff8000', 0.5)).toBe('rgba(255, 128, 0, 0.5)');
	});
});

describe('prepareArtwork', () => {
	/** 위아래 검은 띠 + 가운데 빨간 사각형인 480x360 PNG data URI */
	async function letterboxed(): Promise<string> {
		const Resvg = await loadResvg();
		const svg =
			'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#000"/>' +
			'<rect x="0" y="45" width="480" height="270" fill="#e0283c"/></svg>';
		return `data:image/png;base64,${Buffer.from(new Resvg(svg).render().asPng()).toString('base64')}`;
	}

	it('returns a cropped square, a backdrop and a reddish accent, without the black bars', async () => {
		const prepared = await prepareArtwork(await letterboxed(), 120);
		expect(prepared).not.toBeNull();
		expect(prepared!.art.startsWith('data:image/png;base64,')).toBe(true);
		expect(prepared!.backdrop.startsWith('data:image/png;base64,')).toBe(true);
		const n = parseInt(prepared!.accent!.slice(1), 16);
		expect((n >> 16) & 255).toBeGreaterThan((n & 255) + 40);

		// 잘라낸 정사각 아트워크는 가장자리까지 빨강이어야 해요 (검은 띠가 남아 있으면 위아래가 어두워요)
		const Resvg = await loadResvg();
		const art = new Resvg(
			`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><image href="${prepared!.art}" width="120" height="120"/></svg>`
		).render().pixels;
		const at = (x: number, y: number) => Array.from(art.slice((y * 120 + x) * 4, (y * 120 + x) * 4 + 3));
		for (const [x, y] of [
			[60, 2],
			[60, 117],
			[2, 60],
			[117, 60]
		] as const)
			expect(at(x, y)[0]).toBeGreaterThan(150);
	});

	it('returns null for missing or undecodable images', async () => {
		expect(await prepareArtwork(null, 120)).toBeNull();
		expect(await prepareArtwork('data:image/png;base64,AAAA', 120)).toBeNull();
	});
});

describe('createAsyncLru', () => {
	it('loads once per key, shares in-flight loads and evicts the least recently used', async () => {
		let calls = 0;
		const get = createAsyncLru<string>(2, async (key) => {
			calls += 1;
			return key.toUpperCase();
		});
		expect(await Promise.all([get('a'), get('a')])).toEqual(['A', 'A']);
		expect(calls).toBe(1);
		await get('b');
		await get('a'); // a를 최근으로
		await get('c'); // b가 밀려나요
		expect(calls).toBe(3);
		await get('a');
		expect(calls).toBe(3);
		await get('b');
		expect(calls).toBe(4);
	});
	it('does not remember null or failed loads', async () => {
		let calls = 0;
		const get = createAsyncLru<string>(4, async (key) => {
			calls += 1;
			if (key === 'boom') throw new Error('x');
			return null;
		});
		expect(await get('n')).toBeNull();
		expect(await get('n')).toBeNull();
		await expect(get('boom')).rejects.toThrow();
		await expect(get('boom')).rejects.toThrow();
		expect(calls).toBe(4);
	});
});

describe('imageSizeOf', () => {
	it('reads PNG, GIF and JPEG sizes from the header without decoding', async () => {
		const Resvg = await loadResvg();
		const png = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360"/></svg>')
			.render()
			.asPng();
		expect(imageSizeOf(png)).toEqual({ width: 480, height: 360 });
		// GIF89a, 가로 320(0x0140) 세로 200(0x00c8)
		expect(imageSizeOf(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xc8, 0x00, 0, 0]))).toEqual({ width: 320, height: 200 });
		// JPEG: SOI + APP0(길이 4) + SOF0(높이 360=0x0168, 너비 480=0x01e0)
		const jpeg = Uint8Array.from([
			0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x68, 0x01, 0xe0, 0x03, 0, 0, 0, 0, 0
		]);
		expect(imageSizeOf(jpeg)).toEqual({ width: 480, height: 360 });
	});
	it('returns null for unknown or truncated data', () => {
		expect(imageSizeOf(Uint8Array.from([1, 2, 3]))).toBeNull();
		expect(imageSizeOf(new Uint8Array(40))).toBeNull();
	});
});
