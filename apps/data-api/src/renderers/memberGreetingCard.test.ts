import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GREETINGS, GREETING_TEMPLATES, type GreetingImage } from '@sirubot/utils';
import {
	decodeDataUri,
	GreetingBackgroundError,
	type GreetingCardContext,
	normalizeGreetingBackground,
	normalizeGreetingLayerImage,
	renderGreetingCard
} from './memberGreetingCard.ts';

/** 카드 렌더 스모크 — 1200×675 PNG 시그니처와 배경 경로(프리셋/업로드)를 검증해요. */

/** 테스트용 단색 이미지를 dataURI로 — 업로드 배경/정규화 입력을 만들어요. */
async function solidImage(width: number, height: number): Promise<string> {
	const { Canvas } = await import('skia-canvas');
	const canvas = new Canvas(width, height);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#ff85c1';
	ctx.fillRect(0, 0, width, height);
	return await canvas.toDataURL('png');
}

function makeImage(overrides: Partial<GreetingImage> = {}): GreetingImage {
	return { ...DEFAULT_GREETINGS.welcome.image!, ...overrides };
}

function makeContext(overrides: Partial<GreetingCardContext> = {}): GreetingCardContext {
	return { userId: '123', displayName: '시루', guildName: '시루봇', memberCount: 42, avatarUrl: null, ...overrides };
}

function expectPngSize(buffer: Buffer, width: number, height: number): void {
	expect([buffer[0], buffer[1], buffer[2], buffer[3]]).toEqual([137, 80, 78, 71]);
	// IHDR — PNG 헤더의 너비/높이는 각각 16/20 바이트 오프셋 big-endian
	expect(buffer.readUInt32BE(16)).toBe(width);
	expect(buffer.readUInt32BE(20)).toBe(height);
}

describe('renderGreetingCard', () => {
	it('renders a 1200x675 PNG from a preset background', async () => {
		const buffer = await renderGreetingCard(makeImage(), makeContext());
		expectPngSize(buffer, 1200, 675);
		expect(buffer.length).toBeGreaterThan(1_000);
	});

	it('renders from an uploaded dataUri background', async () => {
		const dataUri = await solidImage(320, 180);
		const buffer = await renderGreetingCard(makeImage({ background: { presetId: null, dataUri } }), makeContext());
		expectPngSize(buffer, 1200, 675);
	});

	it('falls back to a preset when the dataUri is undecodable', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			const buffer = await renderGreetingCard(makedecodableBrokenImage(), makeContext());
			expectPngSize(buffer, 1200, 675);
			expect(consoleError).toHaveBeenCalled();
		} finally {
			consoleError.mockRestore();
		}
	});

	it('renders avatar + text layers from the default greeting', async () => {
		// 기본 인사는 avatar·title·subtitle(텍스트 2) 레이어로 이뤄져 있어요.
		const buffer = await renderGreetingCard(makeImage(), makeContext());
		expectPngSize(buffer, 1200, 675);
	});

	it('renders a shape layer (rect) via the minimal-band template', async () => {
		const minimal = GREETING_TEMPLATES.find((template) => template.id === 'minimal-band')!;
		const buffer = await renderGreetingCard(minimal.image, makeContext());
		expectPngSize(buffer, 1200, 675);
	});

	it('renders an uploaded image layer (sticker) at its size', async () => {
		const sticker = await solidImage(64, 64);
		const buffer = await renderGreetingCard(
			makeImage({
				layers: [{ id: 'sticker', type: 'image', x: 20, y: 20, width: 128, height: 128, dataUri: sticker, opacity: 1 }]
			}),
			makeContext()
		);
		expectPngSize(buffer, 1200, 675);
	});

	it('renders a circle shape layer', async () => {
		const buffer = await renderGreetingCard(
			makeImage({
				layers: [{ id: 'dot', type: 'shape', shape: 'circle', x: 80, y: 30, width: 120, height: 120, color: '#ff85c1', opacity: 0.6 }]
			}),
			makeContext()
		);
		expectPngSize(buffer, 1200, 675);
	});

	it('skips an undecodable image layer without failing the card', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			const buffer = await renderGreetingCard(
				makeImage({
					layers: [
						{ id: 'broken', type: 'image', x: 50, y: 50, width: 100, height: 100, dataUri: 'data:image/png;base64,notbase64', opacity: 1 }
					]
				}),
				makeContext()
			);
			expectPngSize(buffer, 1200, 675);
		} finally {
			consoleError.mockRestore();
		}
	});
});

/** base64 본문만 깨진 dataURI — 렌더러의 폴백 경로를 자극해요 */
function makedecodableBrokenImage(): GreetingImage {
	return makeImage({ background: { presetId: 'plum', dataUri: 'data:image/png;base64,notbase64' } });
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
