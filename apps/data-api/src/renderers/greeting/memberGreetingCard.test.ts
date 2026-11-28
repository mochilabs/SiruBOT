import { describe, expect, it } from 'vitest';
import { imageSizeOf } from '@sirubot/cards';
import { decodeDataUri, GreetingBackgroundError, normalizeGreetingBackground, normalizeGreetingLayerImage } from './memberGreetingCard.ts';
import { fromJsx } from '@takumi-rs/helpers/jsx';
import { parseGifTiming } from '@sirubot/utils';
import { getCardRenderer, renderSvgRaster } from '../shared/takumiKit.tsx';

async function solidImage(width: number, height: number): Promise<string> {
	const png = await renderSvgRaster(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#ff85c1"/></svg>`,
		width,
		height,
		'png'
	);
	return `data:image/png;base64,${png.toString('base64')}`;
}

describe('normalizeGreetingBackground', () => {
	it('downscales to jpeg within the storage cap', async () => {
		const dataUri = await solidImage(2000, 1000);
		const normalized = await normalizeGreetingBackground(dataUri);
		expect(normalized.startsWith('data:image/jpeg;base64,')).toBe(true);
		const decoded = decodeDataUri(normalized);
		expect(decoded?.length ?? 0).toBeLessThanOrEqual(900_000);

		const size = imageSizeOf(decoded!);
		expect(Math.max(size!.width, size!.height)).toBeLessThanOrEqual(1600);
	});

	it('rejects undecodable input with a structured error', async () => {
		const error = await normalizeGreetingBackground('data:image/png;base64,notbase64').catch(
			(error: unknown) => error as GreetingBackgroundError
		);
		expect(error).toBeInstanceOf(GreetingBackgroundError);
		expect((error as GreetingBackgroundError).identifier).toBe('invalid_image');
	});

	it('rejects a missing comma', () => {
		expect(decodeDataUri('data:image/png;base64')).toBeNull();
	});
});

describe('normalizeGreetingLayerImage', () => {
	it('downscales to png within the storage cap, preserving the layer format', async () => {
		const dataUri = await solidImage(2000, 1000);
		const normalized = await normalizeGreetingLayerImage(dataUri);
		expect(normalized.startsWith('data:image/png;base64,')).toBe(true);
		const decoded = decodeDataUri(normalized);
		expect(decoded?.length ?? 0).toBeLessThanOrEqual(900_000);

		const size = imageSizeOf(decoded!);
		expect(Math.max(size!.width, size!.height)).toBeLessThanOrEqual(1200);
	});

	it('rejects undecodable input with a structured error', async () => {
		const error = await normalizeGreetingLayerImage('data:image/png;base64,notbase64').catch(
			(error: unknown) => error as GreetingBackgroundError
		);
		expect(error).toBeInstanceOf(GreetingBackgroundError);
		expect((error as GreetingBackgroundError).identifier).toBe('invalid_image');
	});
});

async function gifDataUri(width: number, height: number, options: { seconds: number; fps: number; animated?: boolean }): Promise<string> {
	const { renderer } = await getCardRenderer();
	const box = {
		type: 'div',
		props: {
			style: { width: 40, height: 40, background: '#ffffff', ...(options.animated === false ? {} : { animation: 'slide 1s linear infinite' }) }
		}
	};
	const { node } = await fromJsx({
		type: 'div',
		props: { style: { display: 'flex', width, height, background: '#ff85c1' }, children: box }
	} as never);
	const buffer = await renderer.renderAnimation({
		scenes: [{ node, durationMs: options.seconds * 1000 }],
		width,
		height,
		fps: options.fps,
		format: 'gif',
		css: ['@keyframes slide { 0% { transform: translateX(0px); } 50% { transform: translateX(80px); } 100% { transform: translateX(0px); } }']
	});
	return `data:image/gif;base64,${Buffer.from(buffer).toString('base64')}`;
}

describe('normalizeGreetingBackground — GIF', () => {
	it('상한 안의 움직이는 GIF는 원본 그대로 돌려줘요 (화질 손실 없음)', async () => {
		const gif = await gifDataUri(320, 180, { seconds: 1, fps: 10 });
		expect(parseGifTiming(decodeDataUri(gif)!)?.frames).toBeGreaterThan(1);
		expect(await normalizeGreetingBackground(gif)).toBe(gif);
	}, 30_000);

	it('1200px보다 크면 줄여서 움직이는 GIF로 다시 인코딩해요', async () => {
		const gif = await gifDataUri(1600, 900, { seconds: 1, fps: 8 });
		const normalized = await normalizeGreetingBackground(gif);
		expect(normalized.startsWith('data:image/gif;base64,')).toBe(true);
		const bytes = decodeDataUri(normalized)!;
		expect(bytes.length).toBeLessThanOrEqual(900_000);
		const timing = parseGifTiming(bytes)!;
		expect(Math.max(timing.width, timing.height)).toBeLessThanOrEqual(1200);
		expect(timing.frames).toBeGreaterThan(1);
	}, 60_000);

	it('5초보다 길면 5초까지만 남겨요', async () => {
		const gif = await gifDataUri(1300, 400, { seconds: 7, fps: 6 });
		const timing = parseGifTiming(decodeDataUri(await normalizeGreetingBackground(gif))!)!;
		expect(timing.durationMs).toBeLessThanOrEqual(5500);
		expect(timing.durationMs).toBeGreaterThan(4000);
	}, 60_000);

	it('프레임이 하나뿐인 정지 GIF는 JPEG로 정규화해요', async () => {
		const gif = await gifDataUri(200, 100, { seconds: 1, fps: 5, animated: false });
		expect(parseGifTiming(decodeDataUri(gif)!)?.frames).toBe(1);
		expect((await normalizeGreetingBackground(gif)).startsWith('data:image/jpeg;base64,')).toBe(true);
	}, 30_000);

	it('깨진 GIF는 invalid_image로 거부해요', async () => {
		const error = await normalizeGreetingBackground('data:image/gif;base64,R0lGODlhAQABAAAAACw=').catch(
			(e: unknown) => e as GreetingBackgroundError
		);
		expect(error).toBeInstanceOf(GreetingBackgroundError);
		expect((error as GreetingBackgroundError).identifier).toBe('invalid_image');
	});

	it('이미지 레이어에 GIF가 들어오면 첫 프레임만 PNG로 만들어요', async () => {
		const gif = await gifDataUri(200, 100, { seconds: 1, fps: 5 });
		expect((await normalizeGreetingLayerImage(gif)).startsWith('data:image/png;base64,')).toBe(true);
	}, 30_000);
});
