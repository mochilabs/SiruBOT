import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GREETINGS, type GreetingImage } from '@sirubot/utils';
import { decodeDataUri, GreetingBackgroundError, normalizeGreetingBackground, renderGreetingCard } from './memberGreetingCard.ts';

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

function expectPngSize(buffer: Buffer, width: number, height: number): void {
	expect([buffer[0], buffer[1], buffer[2], buffer[3]]).toEqual([137, 80, 78, 71]);
	// IHDR — PNG 헤더의 너비/높이는 각각 16/20 바이트 오프셋 big-endian
	expect(buffer.readUInt32BE(16)).toBe(width);
	expect(buffer.readUInt32BE(20)).toBe(height);
}

describe('renderGreetingCard', () => {
	it('renders a 1200x675 PNG from a preset background', async () => {
		const buffer = await renderGreetingCard(makeImage(), {
			userId: '123',
			displayName: '시루',
			guildName: '시루봇',
			memberCount: 42,
			avatarUrl: null
		});
		expectPngSize(buffer, 1200, 675);
		expect(buffer.length).toBeGreaterThan(1_000);
	});

	it('renders from an uploaded dataUri background', async () => {
		const dataUri = await solidImage(320, 180);
		const buffer = await renderGreetingCard(makeImage({ background: { presetId: null, dataUri } }), {
			userId: '123',
			displayName: '시루',
			guildName: '시루봇',
			memberCount: 42,
			avatarUrl: null
		});
		expectPngSize(buffer, 1200, 675);
	});

	it('falls back to a preset when the dataUri is undecodable', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			const buffer = await renderGreetingCard(makedecodableBrokenImage(), {
				userId: '123',
				displayName: '시루',
				guildName: '시루봇',
				memberCount: 42,
				avatarUrl: null
			});
			expectPngSize(buffer, 1200, 675);
			expect(consoleError).toHaveBeenCalled();
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
