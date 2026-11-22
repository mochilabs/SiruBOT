import { describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_GREETINGS,
	GREETING_CARD_H,
	GREETING_CARD_W,
	GREETING_RENDER_SCALE,
	GREETING_TEMPLATES,
	type GreetingAnimation,
	type GreetingImage
} from '@sirubot/utils';
import type { GreetingCardContext } from '../memberGreetingCard.ts';
import { fromJsx } from '@takumi-rs/helpers/jsx';
import { renderGreetingCard } from './greetingCard.ts';
import { getCardRenderer } from './takumiKit.tsx';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../../utils/logger.ts', () => ({ getLogger: () => ({ warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() }) }));

const OUT_W = Math.round(GREETING_CARD_W * GREETING_RENDER_SCALE);
const OUT_H = Math.round(GREETING_CARD_H * GREETING_RENDER_SCALE);
const context: GreetingCardContext = { userId: '1', displayName: '시루', guildName: '시루봇', memberCount: 42, avatarUrl: null };

function expectPngSize(buffer: Buffer, width: number, height: number): void {
	expect([buffer[0], buffer[1], buffer[2], buffer[3]]).toEqual([137, 80, 78, 71]);
	expect(buffer.readUInt32BE(16)).toBe(width);
	expect(buffer.readUInt32BE(20)).toBe(height);
}

/** 애니메이션 WebP 헤더 — 캔버스 크기(VP8X), 프레임 수(ANMF), 반복 횟수(ANIM, 0 = 무한)를 읽어요 */
function webpInfo(buffer: Buffer): { width: number; height: number; frames: number; loop: number } {
	expect(buffer.subarray(0, 4).toString()).toBe('RIFF');
	expect(buffer.subarray(8, 12).toString()).toBe('WEBP');
	let frames = 0;
	for (let i = buffer.indexOf('ANMF'); i >= 0; i = buffer.indexOf('ANMF', i + 4)) frames += 1;
	const anim = buffer.indexOf('ANIM');
	return {
		width: 1 + buffer.readUIntLE(24, 3),
		height: 1 + buffer.readUIntLE(27, 3),
		frames,
		loop: anim >= 0 ? buffer.readUInt16LE(anim + 12) : -1
	};
}

const base = DEFAULT_GREETINGS.welcome.image!;
const withAnimation = (animation: GreetingAnimation): GreetingImage => ({
	...base,
	layers: [...base.layers, { id: 'a', type: 'shape', shape: 'star', x: 20, y: 20, width: 80, height: 80, color: '#ffffff', opacity: 1, animation }]
});

describe('renderGreetingCard', () => {
	it('모든 템플릿을 출력 크기(1200×675 × 축소 배율)의 PNG로 그려요', async () => {
		for (const template of GREETING_TEMPLATES) {
			const card = await renderGreetingCard(template.image, context);
			expect(card.contentType, template.id).toBe(template.image.layers.some((layer) => layer.animation) ? 'image/webp' : 'image/png');
			if (card.contentType === 'image/png') expectPngSize(card.buffer, OUT_W, OUT_H);
			else expect(webpInfo(card.buffer)).toMatchObject({ width: OUT_W, height: OUT_H });
		}
	}, 60_000);

	it('읽을 수 없는 업로드 배경은 프리셋으로, 이미지 레이어는 건너뛰고 경고해요', async () => {
		warn.mockClear();
		const base = DEFAULT_GREETINGS.welcome.image!;
		const broken: GreetingImage = {
			background: { presetId: 'rose', dataUri: 'data:image/png;base64,AAAA' },
			layers: [
				...base.layers,
				{ id: 'i', type: 'image', x: 50, y: 50, width: 100, height: 100, dataUri: 'data:image/png;base64,AAAA', opacity: 1 }
			]
		};
		expectPngSize((await renderGreetingCard(broken, context)).buffer, OUT_W, OUT_H);
		expect(warn).toHaveBeenCalledTimes(2);
	});
});

describe('renderGreetingCard — 움직임', () => {
	it('움직임이 없으면 PNG로 그려요', async () => {
		const card = await renderGreetingCard(base, context);
		expect(card.contentType).toBe('image/png');
	});

	it('움직임이 있으면 무한 반복 애니메이션 WebP로 그려요 (3초 × 20fps = 60프레임)', async () => {
		const card = await renderGreetingCard(withAnimation({ type: 'float', durationMs: 3000, delayMs: 0, intensity: 0.5 }), context);
		expect(card.contentType).toBe('image/webp');
		expect(webpInfo(card.buffer)).toEqual({ width: OUT_W, height: OUT_H, frames: 60, loop: 0 });
	}, 30_000);

	it('회전 단독 애니메이션도 프레임이 여러 개예요 (0→360 두 키프레임은 정지가 되는 회귀)', async () => {
		const card = await renderGreetingCard(withAnimation({ type: 'spin', durationMs: 2000, delayMs: 0, intensity: 0.5 }), context);
		expect(webpInfo(card.buffer).frames).toBe(40);
	}, 30_000);

	it('숨긴 움직임 레이어만 있으면 PNG예요', async () => {
		const hidden = withAnimation({ type: 'pulse', durationMs: 2000, delayMs: 0, intensity: 0.5 });
		hidden.layers[hidden.layers.length - 1]!.hidden = true;
		expect((await renderGreetingCard(hidden, context)).contentType).toBe('image/png');
	});
});

describe('renderGreetingCard — GIF 배경', () => {
	it('움직이는 GIF 배경이면 레이어 움직임이 없어도 애니메이션 WebP로 그려요 (GIF 한 바퀴 × 반복)', async () => {
		const { renderer } = await getCardRenderer();
		const box = { type: 'div', props: { style: { width: 60, height: 60, background: '#ffffff', animation: 'slide 1s linear infinite' } } };
		const { node } = await fromJsx({
			type: 'div',
			props: { style: { display: 'flex', width: 320, height: 180, background: '#3355ff' }, children: box }
		} as never);
		const gif = await renderer.renderAnimation({
			scenes: [{ node, durationMs: 1000 }],
			width: 320,
			height: 180,
			fps: 10,
			format: 'gif',
			css: [
				'@keyframes slide { 0% { transform: translateX(0px); } 50% { transform: translateX(120px); } 100% { transform: translateX(0px); } }'
			]
		});
		const image: GreetingImage = {
			background: { presetId: null, dataUri: `data:image/gif;base64,${Buffer.from(gif).toString('base64')}` },
			layers: base.layers
		};
		const card = await renderGreetingCard(image, context);
		expect(card.contentType).toBe('image/webp');
		// GIF 한 바퀴(1초, 10프레임)가 카드 한 바퀴예요. 인코더가 같은 모양이 이어지는 프레임을 합쳐서 GIF 프레임 수만큼 나와요
		const info = webpInfo(card.buffer);
		expect(info).toMatchObject({ width: OUT_W, height: OUT_H, loop: 0 });
		expect(info.frames).toBeGreaterThan(1);
	}, 30_000);
});
