import { describe, expect, it, vi } from 'vitest';
import { currentGuildTheme, withGuildTheme } from './guildTheme.ts';

describe('withGuildTheme', () => {
	it('실행 중에는 서버 테마를, 끝나면 기본(null)을 돌려줘요', async () => {
		const seen = await withGuildTheme(
			'1',
			async () => 'blue',
			async () => {
				await Promise.resolve();
				return currentGuildTheme();
			}
		);
		expect(seen).toBe('blue');
		expect(currentGuildTheme()).toBeNull();
	});

	it('DM(길드 없음)·조회 실패·깨진 값은 기본(pink)으로 진행해요', async () => {
		expect(
			await withGuildTheme(
				null,
				async () => 'blue',
				() => currentGuildTheme()
			)
		).toBe('pink');
		expect(
			await withGuildTheme(
				'1',
				async () => Promise.reject(new Error('db')),
				() => currentGuildTheme()
			)
		).toBe('pink');
		expect(
			await withGuildTheme(
				'1',
				async () => 'nope',
				() => currentGuildTheme()
			)
		).toBe('pink');
	});

	it('이미 맥락 안이면 다시 조회하지 않아요 (중첩 호출이 DB를 반복해서 치지 않아요)', async () => {
		const load = vi.fn(async () => 'green');
		await withGuildTheme('1', load, () => withGuildTheme('1', load, () => withGuildTheme('1', load, () => undefined)));
		expect(load).toHaveBeenCalledTimes(1);
	});
});
