import { describe, expect, it, vi } from 'vitest';
import type { CanvasRenderingContext2D } from 'skia-canvas';
import { DEFAULT_GREETINGS, GREETING_CARD_H, GREETING_CARD_W, GREETING_RENDER_SCALE, GREETING_TEMPLATES, type GreetingImage } from '@sirubot/utils';
import { greetingPresetBackgroundPlan } from '@sirubot/utils/greetingCardDesign';
import {
	decodeDataUri,
	drawPresetBackground,
	GreetingBackgroundError,
	type GreetingCardContext,
	normalizeGreetingBackground,
	normalizeGreetingLayerImage,
	renderGreetingCard
} from './memberGreetingCard.ts';

/** 카드 렌더 스모크 — 출력 PNG 시그니처(논리 1200×675 × GREETING_RENDER_SCALE = 800×450)와 배경 경로(프리셋/업로드)를 검증해요. */

/** 기대 출력 크기 — 논리 좌표계(1200×675)에 출력 축소 배율을 곱한 값 */
const OUT_W = Math.round(GREETING_CARD_W * GREETING_RENDER_SCALE);
const OUT_H = Math.round(GREETING_CARD_H * GREETING_RENDER_SCALE);

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
	it('renders a scaled-down PNG (logical 1200×675 × GREETING_RENDER_SCALE) from a preset background', async () => {
		const buffer = await renderGreetingCard(makeImage(), makeContext());
		expectPngSize(buffer, OUT_W, OUT_H);
		expect(buffer.length).toBeGreaterThan(1_000);
	});

	it('renders from an uploaded dataUri background', async () => {
		const dataUri = await solidImage(320, 180);
		const buffer = await renderGreetingCard(makeImage({ background: { presetId: null, dataUri } }), makeContext());
		expectPngSize(buffer, OUT_W, OUT_H);
	});

	it('falls back to a preset when the dataUri is undecodable', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			const buffer = await renderGreetingCard(makedecodableBrokenImage(), makeContext());
			expectPngSize(buffer, OUT_W, OUT_H);
			expect(consoleError).toHaveBeenCalled();
		} finally {
			consoleError.mockRestore();
		}
	});

	it('renders avatar + text layers from the default greeting', async () => {
		// 기본 인사는 avatar·title·subtitle(텍스트 2) 레이어로 이뤄져 있어요.
		const buffer = await renderGreetingCard(makeImage(), makeContext());
		expectPngSize(buffer, OUT_W, OUT_H);
	});

	it('renders a shape layer (rect) via the minimal-band template', async () => {
		const minimal = GREETING_TEMPLATES.find((template) => template.id === 'minimal-band')!;
		const buffer = await renderGreetingCard(minimal.image, makeContext());
		expectPngSize(buffer, OUT_W, OUT_H);
	});

	it('renders an uploaded image layer (sticker) at its size', async () => {
		const sticker = await solidImage(64, 64);
		const buffer = await renderGreetingCard(
			makeImage({
				layers: [{ id: 'sticker', type: 'image', x: 20, y: 20, width: 128, height: 128, dataUri: sticker, opacity: 1 }]
			}),
			makeContext()
		);
		expectPngSize(buffer, OUT_W, OUT_H);
	});

	it('renders a circle shape layer', async () => {
		const buffer = await renderGreetingCard(
			makeImage({
				layers: [{ id: 'dot', type: 'shape', shape: 'circle', x: 80, y: 30, width: 120, height: 120, color: '#ff85c1', opacity: 0.6 }]
			}),
			makeContext()
		);
		expectPngSize(buffer, OUT_W, OUT_H);
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
			expectPngSize(buffer, OUT_W, OUT_H);
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

// ── 프리셋 배경 색상 시퀀스 — 공용 계약(greetingCardDesign)의 시각 동등성 ──

/** 프리셋 3종 전수 기대 시퀀스 — 바닥색 → 대각 그라디언트 2스톱 → 코너 글로우 rgba 2스톱 → 스톱별 채우기.
 * dashboard(greeting-draw.test.ts)가 같은 리터럴을 같은 순서로 비교해요 — 양쪽 렌더 결과의 동등성 오라클. */
const PRESET_SEQUENCES: Record<string, string[]> = {
	rose: [
		'fillRect:#3d2328',
		'linear:0:#d1608a',
		'linear:1:#ff85c1',
		'fillRect:linear',
		'glow:0:rgba(255,228,240,0.2)',
		'glow:1:rgba(255,228,240,0)',
		'fillRect:glow'
	],
	plum: [
		'fillRect:#1a0e12',
		'linear:0:#231317',
		'linear:1:#4d2a35',
		'fillRect:linear',
		'glow:0:rgba(255,179,217,0.2)',
		'glow:1:rgba(255,179,217,0)',
		'fillRect:glow'
	],
	gold: [
		'fillRect:#231a10',
		'linear:0:#8a6a44',
		'linear:1:#d4a574',
		'fillRect:linear',
		'glow:0:rgba(240,226,207,0.2)',
		'glow:1:rgba(240,226,207,0)',
		'fillRect:glow'
	]
};

/** 배경 드로잉(canvas 호출)만 기록하는 mock 컨텍스트 — 프리셋 색상·기하 시퀀스 검증용 */
function recordingContext(): { ctx: CanvasRenderingContext2D; ops: string[]; geometry: { linear: number[] | null; radial: number[] | null } } {
	const ops: string[] = [];
	const geometry: { linear: number[] | null; radial: number[] | null } = { linear: null, radial: null };
	let fillStyle: string | { kind: string } = '';
	const gradient = (kind: string) => ({ kind, addColorStop: (offset: number, color: string) => ops.push(`${kind}:${offset}:${color}`) });
	const ctx = {
		get fillStyle(): string | { kind: string } {
			return fillStyle;
		},
		set fillStyle(value: string | { kind: string }) {
			fillStyle = value;
		},
		fillRect: () => ops.push(`fillRect:${typeof fillStyle === 'string' ? fillStyle : fillStyle.kind}`),
		createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => {
			geometry.linear = [x0, y0, x1, y1];
			return gradient('linear');
		},
		createRadialGradient: (x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => {
			geometry.radial = [x0, y0, r0, x1, y1, r1];
			return gradient('glow');
		}
	};
	return { ctx: ctx as unknown as CanvasRenderingContext2D, ops, geometry };
}

describe('drawPresetBackground — 프리셋 배경 색상 시퀀스', () => {
	it('프리셋 3종 전수에서 계약의 색을 바닥→대각 그라디언트→코너 글로우 순서로 그려요', () => {
		for (const [presetId, expected] of Object.entries(PRESET_SEQUENCES)) {
			const { ctx, ops } = recordingContext();
			drawPresetBackground(ctx, greetingPresetBackgroundPlan(GREETING_CARD_W, GREETING_CARD_H, presetId));
			expect(ops).toEqual(expected);
		}
	});

	it('그라데이션 좌표·글로우 기하는 카드 1200×675 기준 계약값(좌하→우상, 우상단 코너)과 같아요', () => {
		const { ctx, geometry } = recordingContext();
		drawPresetBackground(ctx, greetingPresetBackgroundPlan(GREETING_CARD_W, GREETING_CARD_H, 'rose'));
		expect(geometry.linear).toEqual([0, GREETING_CARD_H, GREETING_CARD_W, 0]);
		expect(geometry.radial).toEqual([
			GREETING_CARD_W * 0.78,
			GREETING_CARD_H * 0.22,
			0,
			GREETING_CARD_W * 0.78,
			GREETING_CARD_H * 0.22,
			GREETING_CARD_W * 0.55
		]);
	});
});
