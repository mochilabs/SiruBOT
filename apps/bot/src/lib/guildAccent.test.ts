import { describe, expect, it } from 'vitest';
import { currentGuildAccent, withGuildAccent } from './guildAccent.ts';

describe('withGuildAccent', () => {
	it('실행 중에는 서버 강조색을, 끝나면 기본(null)을 돌려줘요', async () => {
		const seen = await withGuildAccent(
			'1',
			async () => '#ABCDEF',
			async () => {
				await Promise.resolve();
				return currentGuildAccent();
			}
		);
		expect(seen).toBe('#abcdef');
		expect(currentGuildAccent()).toBeNull();
	});

	it('DM(길드 없음)이거나 조회가 실패하거나 값이 깨졌으면 기본색으로 진행해요', async () => {
		expect(
			await withGuildAccent(
				null,
				async () => '#ffffff',
				() => currentGuildAccent()
			)
		).toBeNull();
		expect(
			await withGuildAccent(
				'1',
				async () => Promise.reject(new Error('db')),
				() => currentGuildAccent()
			)
		).toBeNull();
		expect(
			await withGuildAccent(
				'1',
				async () => 'nope',
				() => currentGuildAccent()
			)
		).toBeNull();
	});
});
