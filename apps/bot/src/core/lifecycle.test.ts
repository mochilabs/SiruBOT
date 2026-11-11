import { describe, expect, it, vi } from 'vitest';
import { Lifecycle } from './lifecycle.ts';

describe('Lifecycle', () => {
	it('등록 순서의 역순으로 stop을 실행해요 (stop이 없는 컴포넌트는 건너뛰어요)', async () => {
		const calls: string[] = [];
		const lifecycle = new Lifecycle();
		lifecycle.register('a', () => void calls.push('a'));
		lifecycle.register('no-stop');
		lifecycle.register('b', async () => {
			await Promise.resolve();
			calls.push('b');
		});
		lifecycle.register('c', () => void calls.push('c'));

		await lifecycle.shutdown({ error: vi.fn() });
		expect(calls).toEqual(['c', 'b', 'a']);
	});

	it('stop이 실패해도 로그를 남기고 나머지를 계속 실행해요', async () => {
		const calls: string[] = [];
		const logger = { error: vi.fn() };
		const lifecycle = new Lifecycle();
		lifecycle.register('first', () => void calls.push('first'));
		lifecycle.register('broken-async', async () => {
			throw new Error('boom');
		});
		lifecycle.register('broken-sync', () => {
			throw new Error('bang');
		});
		lifecycle.register('last', () => void calls.push('last'));

		await expect(lifecycle.shutdown(logger)).resolves.toBeUndefined();
		expect(calls).toEqual(['last', 'first']);
		expect(logger.error).toHaveBeenCalledTimes(2);
		expect(logger.error.mock.calls[0][0]).toContain('broken-sync');
		expect(logger.error.mock.calls[1][0]).toContain('broken-async');
	});

	it('두 번째 shutdown은 stop을 다시 실행하지 않아요', async () => {
		const stop = vi.fn();
		const lifecycle = new Lifecycle();
		lifecycle.register('x', stop);

		await Promise.all([lifecycle.shutdown({ error: vi.fn() }), lifecycle.shutdown({ error: vi.fn() })]);
		await lifecycle.shutdown({ error: vi.fn() });
		expect(stop).toHaveBeenCalledTimes(1);
	});
});
