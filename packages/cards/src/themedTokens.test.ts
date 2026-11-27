import { describe, expect, it } from 'vitest';
import { T, themedTokens } from './tokens.ts';

const PINK = '#ff85c0';

describe('themedTokens', () => {
	it('기본(분홍)은 기존 토큰 T를 그대로 돌려줘요', () => {
		expect(themedTokens(PINK, PINK)).toBe(T);
		expect(themedTokens('#FF85C0', PINK)).toBe(T);
	});

	it('다른 색은 같은 색상의 틴트로 모든 토큰을 유도해요', () => {
		const blue = themedTokens('#5b9dff', PINK);
		expect(blue.brand).toBe('#5b9dff');
		for (const key of Object.keys(T) as (keyof typeof T)[]) expect(blue[key]).toMatch(/^#[0-9a-f]{6}$/);
		for (const key of Object.keys(T) as (keyof typeof T)[]) {
			if (key !== 'destructive') expect(blue[key]).not.toBe(T[key]);
		}
		expect(blue.background < blue.surface1 && blue.surface1 < blue.surface2).toBe(true);
		expect(blue.foreground > blue.mutedForeground).toBe(true);
	});
});
