import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GREETINGS, GREETING_CARD_H, GREETING_CARD_W, GREETING_RENDER_SCALE, GREETING_TEMPLATES, type GreetingImage } from '@sirubot/utils';
import type { GreetingCardContext } from '../memberGreetingCard.ts';
import { renderGreetingCardSatori } from './greetingCard.ts';

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

describe('renderGreetingCardSatori', () => {
	it('모든 템플릿을 skia와 같은 출력 크기(1200×675 × 축소 배율)의 PNG로 그려요', async () => {
		for (const template of GREETING_TEMPLATES) {
			expectPngSize(await renderGreetingCardSatori(template.image, context), OUT_W, OUT_H);
		}
	});

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
		expectPngSize(await renderGreetingCardSatori(broken, context), OUT_W, OUT_H);
		expect(warn).toHaveBeenCalledTimes(2);
	});
});
