import { afterEach, describe, expect, it, vi } from 'vitest';
import { PendingRequestPool, type PendingRequestPoolLogger } from './pendingRequestPool.ts';

type TestResult = { ok: true; value: string } | { ok: false; reason: 'timeout' | 'failed' };

const TIMEOUT_RESULT: TestResult = { ok: false, reason: 'timeout' };

interface PoolSetup {
	pool: PendingRequestPool<TestResult>;
	timeouts: string[];
	warnings: string[];
}

function makePool(capacity = 2): PoolSetup {
	const timeouts: string[] = [];
	const warnings: string[] = [];
	const logger: PendingRequestPoolLogger = {
		warn: (message) => warnings.push(message)
	};
	const pool = new PendingRequestPool<TestResult>({
		capacity,
		logger,
		timeoutResult: () => TIMEOUT_RESULT,
		onTimeout: (id) => timeouts.push(id)
	});
	return { pool, timeouts, warnings };
}

describe('PendingRequestPool', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('registers a request and resolves it with the success payload', async () => {
		const { pool, timeouts } = makePool();
		const promise = pool.register('req-1', 3_000);
		expect(pool.size).toBe(1);

		expect(pool.resolve('req-1', { ok: true, value: 'done' })).toBe(true);
		await expect(promise).resolves.toEqual({ ok: true, value: 'done' });
		expect(pool.size).toBe(0);
		expect(timeouts).toEqual([]);
		expect(pool.resolve('req-1', { ok: true, value: 'again' })).toBe(false);
	});

	it('resolves with the timeout payload when nothing completes the request within timeoutMs', async () => {
		vi.useFakeTimers();
		const { pool, timeouts } = makePool();
		const promise = pool.register('req-1', 3_000);
		const assertion = expect(promise).resolves.toEqual(TIMEOUT_RESULT);

		await vi.advanceTimersByTimeAsync(2_999);
		expect(pool.size).toBe(1);

		await vi.advanceTimersByTimeAsync(1);
		await assertion;
		expect(pool.size).toBe(0);
		expect(timeouts).toEqual(['req-1']);
		expect(pool.resolve('req-1', { ok: true, value: 'late' })).toBe(false);
		expect(pool.fail('req-1', { ok: false, reason: 'failed' })).toBe(false);
	});

	it('fails a new registration immediately when the limit is reached, keeping older requests pending', async () => {
		vi.useFakeTimers();
		const { pool, timeouts, warnings } = makePool(1);
		const first = pool.register('req-1', 3_000);
		expect(pool.size).toBe(1);

		await expect(pool.register('req-2', 3_000)).resolves.toEqual(TIMEOUT_RESULT);
		expect(pool.size).toBe(1);
		expect(timeouts).toEqual(['req-2']);
		expect(warnings).toHaveLength(1);

		expect(pool.resolve('req-1', { ok: true, value: 'first' })).toBe(true);
		await expect(first).resolves.toEqual({ ok: true, value: 'first' });
	});

	it('fails only the new registration when the id is already pending', async () => {
		const { pool, timeouts, warnings } = makePool();
		const original = pool.register('req-1', 3_000);
		expect(pool.size).toBe(1);

		await expect(pool.register('req-1', 3_000)).resolves.toEqual(TIMEOUT_RESULT);
		expect(pool.size).toBe(1);
		expect(timeouts).toEqual(['req-1']);
		expect(warnings).toHaveLength(1);

		expect(pool.resolve('req-1', { ok: true, value: 'original' })).toBe(true);
		await expect(original).resolves.toEqual({ ok: true, value: 'original' });
	});

	it('works without a logger or onTimeout (silent)', async () => {
		const pool = new PendingRequestPool<TestResult>({ capacity: 1, timeoutResult: () => TIMEOUT_RESULT });
		pool.register('req-1', 3_000);
		await expect(pool.register('req-2', 3_000)).resolves.toEqual(TIMEOUT_RESULT);
		expect(pool.size).toBe(1);
	});

	it('fail() completes a pending request with the given payload (publish failure path)', async () => {
		const { pool, timeouts } = makePool();
		const promise = pool.register('req-1', 3_000);
		expect(pool.fail('req-1', { ok: false, reason: 'failed' })).toBe(true);
		await expect(promise).resolves.toEqual({ ok: false, reason: 'failed' });
		expect(pool.size).toBe(0);
		expect(timeouts).toEqual([]);
		expect(pool.fail('missing', { ok: false, reason: 'failed' })).toBe(false);
	});

	it('timeoutResult가 onTimeout보다 먼저 계산돼요 — 묶인 메타데이터(예: guildId)를 읽을 수 있어야 해요', async () => {
		vi.useFakeTimers();
		const meta = new Map([['req-1', 'guild-1']]);
		const observed: Array<string | undefined> = [];
		const pool = new PendingRequestPool<{ ok: false; guildId: string }>({
			capacity: 1,
			timeoutResult: (id) => ({ ok: false, guildId: meta.get(id) ?? '' }),
			onTimeout: (id) => {
				observed.push(meta.get(id));
				meta.delete(id);
			}
		});

		const timed = pool.register('req-1', 3_000);
		await vi.advanceTimersByTimeAsync(3_000);
		await expect(timed).resolves.toEqual({ ok: false, guildId: 'guild-1' });

		pool.register('req-3', 60_000);
		meta.set('req-2', 'guild-2');
		await expect(pool.register('req-2', 3_000)).resolves.toEqual({ ok: false, guildId: 'guild-2' });

		expect(observed).toEqual(['guild-1', 'guild-2']);
	});

	it('failAll() completes every pending request and returns the completed count', async () => {
		vi.useFakeTimers();
		const { pool, timeouts } = makePool(10);
		const first = pool.register('req-1', 3_000);
		const second = pool.register('req-2', 3_000);
		expect(pool.size).toBe(2);

		expect(pool.failAll((id) => ({ ok: true, value: `drained-${id}` }))).toBe(2);
		expect(pool.size).toBe(0);
		expect(timeouts).toEqual([]);

		await expect(first).resolves.toEqual({ ok: true, value: 'drained-req-1' });
		await expect(second).resolves.toEqual({ ok: true, value: 'drained-req-2' });

		await vi.advanceTimersByTimeAsync(60_000);
		await Promise.resolve();
	});
});
