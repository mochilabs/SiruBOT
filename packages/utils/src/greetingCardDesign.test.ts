import { describe, expect, it } from 'vitest';

import {
	GREETING_PRESET_GRADIENTS,
	GREETING_PRESET_SCRIM,
	greetingPresetBackgroundPlan,
	hexToRgba,
	type GreetingPresetBackgroundPlan
} from './greetingCardDesign.ts';
import { PRESET_BACKGROUNDS } from './memberGreeting.ts';

/** 카드 논리 좌표계 — 렌더러·미리보기가 함께 쓰는 크기 */
const CARD_W = 1200;
const CARD_H = 675;

/** 계획에서 뽑는 색상 시퀀스 — 바닥색 → 대각 그라디언트 스톱 → 글로우 스톱 (스크림은 별도) */
function colorSequence(plan: GreetingPresetBackgroundPlan): string[] {
	return [plan.base, ...plan.linear.stops.map(([, color]) => color), ...plan.glow.stops.map(([, color]) => color)];
}

describe('greetingCardDesign — 브랜드 시각 계약', () => {
	it('프리셋 그라디언트 hex 12값과 스크림 색은 시각 계약이에요 — 값 변경은 렌더가 달라져요', () => {
		expect(GREETING_PRESET_GRADIENTS).toEqual({
			rose: { base: '#3d2328', from: '#d1608a', to: '#ff85c1', glow: '#ffe4f0' },
			plum: { base: '#1a0e12', from: '#231317', to: '#4d2a35', glow: '#ffb3d9' },
			gold: { base: '#231a10', from: '#8a6a44', to: '#d4a574', glow: '#f0e2cf' }
		});
		expect(GREETING_PRESET_SCRIM).toBe('rgba(26,14,18,0.32)');
	});

	it('프리셋 3종의 색 시퀀스(바닥·그라디언트 2스톱·글로우 rgba 2스톱)가 계획에 그대로 들어가요', () => {
		expect(colorSequence(greetingPresetBackgroundPlan(CARD_W, CARD_H, 'rose'))).toEqual([
			'#3d2328',
			'#d1608a',
			'#ff85c1',
			'rgba(255,228,240,0.2)',
			'rgba(255,228,240,0)'
		]);
		expect(colorSequence(greetingPresetBackgroundPlan(CARD_W, CARD_H, 'plum'))).toEqual([
			'#1a0e12',
			'#231317',
			'#4d2a35',
			'rgba(255,179,217,0.2)',
			'rgba(255,179,217,0)'
		]);
		expect(colorSequence(greetingPresetBackgroundPlan(CARD_W, CARD_H, 'gold'))).toEqual([
			'#231a10',
			'#8a6a44',
			'#d4a574',
			'rgba(240,226,207,0.2)',
			'rgba(240,226,207,0)'
		]);
	});

	it('대각 그라디언트는 좌하→우상, 코너 글로우는 우상단(0.78, 0.22)·반지름 폭의 0.55로 고정해요', () => {
		const plan = greetingPresetBackgroundPlan(CARD_W, CARD_H, 'rose');
		expect(plan.linear).toMatchObject({ x0: 0, y0: CARD_H, x1: CARD_W, y1: 0 });
		expect(plan.glow.cx).toBe(CARD_W * 0.78);
		expect(plan.glow.cy).toBe(CARD_H * 0.22);
		expect(plan.glow.radius).toBe(CARD_W * 0.55);
	});

	it('미지정·알 수 없는 프리셋 id는 plum으로 폴백해요', () => {
		const plum = greetingPresetBackgroundPlan(CARD_W, CARD_H, 'plum');
		expect(greetingPresetBackgroundPlan(CARD_W, CARD_H, null)).toEqual(plum);
		expect(greetingPresetBackgroundPlan(CARD_W, CARD_H, 'nope')).toEqual(plum);
	});

	it('hexToRgba는 #RRGGBB와 알파를 canvas rgba 문자열로 바꿔요', () => {
		expect(hexToRgba('#ffe4f0', 0.2)).toBe('rgba(255,228,240,0.2)');
		expect(hexToRgba('#ffb3d9', 0)).toBe('rgba(255,179,217,0)');
		expect(hexToRgba('#000000', 1)).toBe('rgba(0,0,0,1)');
	});

	it('zod 검증이 허용하는 프리셋 id(memberGreeting)와 그라디언트 맵 키가 일치해요', () => {
		expect(PRESET_BACKGROUNDS.map((preset) => preset.id)).toEqual(Object.keys(GREETING_PRESET_GRADIENTS));
	});
});
