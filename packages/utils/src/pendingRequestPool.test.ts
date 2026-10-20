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
		// 정상 완료는 타임아웃 회수가 아니에요 — onTimeout이 불리지 않아요
		expect(timeouts).toEqual([]);
		// 이미 완료된 id는 더 이상 완료할 수 없어요
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
		// 타임아웃 회수 뒤의 resolve/fail은 아무 효과가 없어요
		expect(pool.resolve('req-1', { ok: true, value: 'late' })).toBe(false);
		expect(pool.fail('req-1', { ok: false, reason: 'failed' })).toBe(false);
	});

	it('fails a new registration immediately when the limit is reached, keeping older requests pending', async () => {
		vi.useFakeTimers();
		const { pool, timeouts, warnings } = makePool(1);
		const first = pool.register('req-1', 3_000);
		expect(pool.size).toBe(1);

		// 상한 초과 — 등록되지 않고 즉시 실패해요 (대기 요청 누수 방지)
		await expect(pool.register('req-2', 3_000)).resolves.toEqual(TIMEOUT_RESULT);
		expect(pool.size).toBe(1);
		expect(timeouts).toEqual(['req-2']);
		expect(warnings).toHaveLength(1);

		// 첫 요청은 여전히 유효해요
		expect(pool.resolve('req-1', { ok: true, value: 'first' })).toBe(true);
		await expect(first).resolves.toEqual({ ok: true, value: 'first' });
	});

	it('fails only the new registration when the id is already pending', async () => {
		const { pool, timeouts, warnings } = makePool();
		const original = pool.register('req-1', 3_000);
		expect(pool.size).toBe(1);

		await expect(pool.register('req-1', 3_000)).resolves.toEqual(TIMEOUT_RESULT);
		// 기존 대기는 덮어쓰이지 않고 살아 있어요
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

	it('failAll() completes every pending request and returns the completed count', async () => {
		vi.useFakeTimers();
		const { pool, timeouts } = makePool(10);
		const first = pool.register('req-1', 3_000);
		const second = pool.register('req-2', 3_000);
		expect(pool.size).toBe(2);

		expect(pool.failAll((id) => ({ ok: true, value: `drained-${id}` }))).toBe(2);
		expect(pool.size).toBe(0);
		// failAll은 타임아웃 회수가 아니에요 — 호출자가 메타데이터를 통째로 정리해요
		expect(timeouts).toEqual([]);

		await expect(first).resolves.toEqual({ ok: true, value: 'drained-req-1' });
		await expect(second).resolves.toEqual({ ok: true, value: 'drained-req-2' });

		// 회수된 요청의 타이머는 해제돼요 — 이후 시각에도 다시 완료되지 않아요
		await vi.advanceTimersByTimeAsync(60_000);
		await Promise.resolve();
	});
});
