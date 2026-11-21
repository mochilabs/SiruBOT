import { describe, expect, it } from 'vitest';
import { prepareArtwork } from './artwork.ts';
import { renderSvgRaster } from './takumiKit.tsx';

describe('prepareArtwork', () => {
	/** 위아래 검은 띠 + 가운데 빨간 사각형인 480x360 PNG data URI */
	async function letterboxed(): Promise<string> {
		const svg =
			'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#000"/>' +
			'<rect x="0" y="45" width="480" height="270" fill="#e0283c"/></svg>';
		const png = await renderSvgRaster(svg, 480, 360, 'png');
		return `data:image/png;base64,${png.toString('base64')}`;
	}

	it('returns a cropped square, a backdrop and a reddish accent, without the black bars', async () => {
		const prepared = await prepareArtwork(await letterboxed(), 120);
		expect(prepared).not.toBeNull();
		expect(prepared!.art.startsWith('data:image/png;base64,')).toBe(true);
		expect(prepared!.backdrop.startsWith('data:image/png;base64,')).toBe(true);
		const n = parseInt(prepared!.accent!.slice(1), 16);
		expect((n >> 16) & 255).toBeGreaterThan((n & 255) + 40);

		// 잘라낸 정사각 아트워크는 가장자리까지 빨강이어야 해요 (검은 띠가 남아 있으면 위아래가 어두워요)
		const art = await renderSvgRaster(
			`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><image href="${prepared!.art}" width="120" height="120"/></svg>`,
			120,
			120,
			'raw'
		);
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
