import type { CanvasRenderingContext2D } from 'skia-canvas';
import { describe, expect, it } from 'vitest';
import { formatClock, hashString, hexToRgba, makeRng, truncate } from './shapes.ts';

/** 글자 수 × 10px로 재는 가짜 측정 컨텍스트 */
function fakeCtx(): CanvasRenderingContext2D {
	return { measureText: (text: string) => ({ width: text.length * 10 }) } as unknown as CanvasRenderingContext2D;
}

describe('truncate', () => {
	it('폭이 여유 있으면 원문을 그대로 돌려줘요', () => {
		expect(truncate(fakeCtx(), 'abcdef', 100)).toBe('abcdef');
		expect(truncate(fakeCtx(), 'a', 10)).toBe('a');
	});

	it('넘치면 말줄임표를 붙여 폭 안에 들어오게 줄여요', () => {
		const ctx = fakeCtx();
		const result = truncate(ctx, 'abcdef', 25);
		expect(result.endsWith('…')).toBe(true);
		expect(ctx.measureText(result).width).toBeLessThanOrEqual(25);
	});
});

describe('hashString', () => {
	it('FNV-1a 해시값을 일관되게 돌려줘요', () => {
		expect(hashString('abc')).toBe(440920331);
		expect(hashString('')).toBe(2166136261);
		expect(hashString('시루')).toBe(1159658953);
	});

	it('uint32 범위에서 다른 문자열에 다른 값을 줘요', () => {
		const value = hashString('guild-1');
		expect(value).toBeGreaterThanOrEqual(0);
		expect(value).toBeLessThanOrEqual(0xffffffff);
		expect(hashString('guild-1')).toBe(value);
		expect(hashString('guild-2')).not.toBe(value);
	});
});

describe('makeRng', () => {
	it('같은 시드는 같은 난수열을 만들어요', () => {
		const a = makeRng(hashString('시루'));
		const b = makeRng(hashString('시루'));
		expect([a(), a(), a()]).toEqual([b(), b(), b()]);
		const fresh = makeRng(hashString('시루'));
		expect([fresh(), fresh(), fresh()]).toEqual([0.8779437886551023, 0.6208791069220752, 0.03151743998751044]);
	});

	it('0 시드도 쓸 수 있고(1로 대체) 결과는 0~1 사이에요', () => {
		const rng = makeRng(0);
		const values = [rng(), rng(), rng()];
		expect(values).toEqual([0.23645552527159452, 0.3692706737201661, 0.5042420323006809]);
		for (const value of values) {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});
});

describe('formatClock', () => {
	it('초 단위는 m:ss, 한 시간 이상은 h:mm:ss로 줘요', () => {
		expect(formatClock(0)).toBe('0:00');
		expect(formatClock(65_000)).toBe('1:05');
		expect(formatClock(59_999)).toBe('0:59');
		expect(formatClock(3_723_000)).toBe('1:02:03');
	});

	it('음수는 0:00으로 처리해요', () => {
		expect(formatClock(-1_000)).toBe('0:00');
	});
});

describe('hexToRgba', () => {
	it('헥스 색을 alpha와 함께 rgba 문자열로 바꿔요', () => {
		expect(hexToRgba('#ff85c1', 0.5)).toBe('rgba(255,133,193,0.5)');
		expect(hexToRgba('#000000', 1)).toBe('rgba(0,0,0,1)');
		expect(hexToRgba('#ffffff', 0)).toBe('rgba(255,255,255,0)');
	});
});
