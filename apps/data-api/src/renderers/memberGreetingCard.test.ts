import { describe, expect, it } from 'vitest';
import { decodeDataUri, GreetingBackgroundError, normalizeGreetingBackground, normalizeGreetingLayerImage } from './memberGreetingCard.ts';

/** 테스트용 단색 이미지를 dataURI로 — 업로드 정규화 입력을 만들어요. */
async function solidImage(width: number, height: number): Promise<string> {
	const { Canvas } = await import('skia-canvas');
	const canvas = new Canvas(width, height);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#ff85c1';
	ctx.fillRect(0, 0, width, height);
	return await canvas.toDataURL('png');
}

describe('normalizeGreetingBackground', () => {
	it('downscales to jpeg within the storage cap', async () => {
		const dataUri = await solidImage(2000, 1000);
		const normalized = await normalizeGreetingBackground(dataUri);
		expect(normalized.startsWith('data:image/jpeg;base64,')).toBe(true);
		const decoded = decodeDataUri(normalized);
		expect(decoded?.length ?? 0).toBeLessThanOrEqual(900_000);

		const { loadImage } = await import('skia-canvas');
		const img = await loadImage(decoded!);
		expect(Math.max(img.width, img.height)).toBeLessThanOrEqual(1600);
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

		const { loadImage } = await import('skia-canvas');
		const img = await loadImage(decoded!);
		expect(Math.max(img.width, img.height)).toBeLessThanOrEqual(1200);
	});

	it('rejects undecodable input with a structured error', async () => {
		const error = await normalizeGreetingLayerImage('data:image/png;base64,notbase64').catch(
			(error: unknown) => error as GreetingBackgroundError
		);
		expect(error).toBeInstanceOf(GreetingBackgroundError);
		expect((error as GreetingBackgroundError).identifier).toBe('invalid_image');
	});
});
