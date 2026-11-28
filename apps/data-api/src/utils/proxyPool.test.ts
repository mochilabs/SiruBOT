import { describe, expect, it, vi } from 'vitest';
import { parseRouteList, ProxyPool, ProxyUnavailableError, RouteBlockedError } from './proxyPool.ts';

const A = 'http://10.0.0.28:3128';
const B = 'http://10.0.0.28:3129';

function poolWith(entries: string[], statusFor: (entry: string) => number | Error, clock = { now: 0 }) {
	const calls: string[] = [];
	const pool = new ProxyPool(entries, {
		now: () => clock.now,
		createFetch: (entry) => async () => {
			calls.push(entry);
			const status = statusFor(entry);
			if (status instanceof Error) throw status;
			return new Response('body', { status });
		}
	});
	const task = async (route: { fetch: typeof fetch }) => {
		const res = await route.fetch('https://www.youtube.com/x');
		if (!res.ok) throw new Error(`status ${res.status}`);
		return res.status;
	};
	return { pool, calls, task, clock };
}

describe('parseRouteList', () => {
	it('defaults to direct and keeps the written order without duplicates', () => {
		expect(parseRouteList(undefined)).toEqual(['direct']);
		expect(parseRouteList(' ')).toEqual(['direct']);
		expect(parseRouteList(`direct, ${A},${B},${A}`)).toEqual(['direct', A, B]);
	});

	it('rejects unsupported proxy schemes', () => {
		expect(() => parseRouteList('socks5://10.0.0.28:1080')).toThrow('unsupported proxy protocol');
	});
});

describe('ProxyPool', () => {
	it('uses direct first while it works', async () => {
		const { pool, calls, task } = poolWith(['direct', A, B], () => 200);
		await pool.run('captions', task);
		await pool.run('captions', task);
		expect(calls).toEqual(['direct', 'direct']);
	});

	it('moves to a proxy on 429 within the same run and keeps direct cooling for that scope only', async () => {
		const { pool, calls, task } = poolWith(['direct', A, B], (e) => (e === 'direct' ? 429 : 200));
		await expect(pool.run('captions', task)).resolves.toBe(200);
		expect(calls).toEqual(['direct', A]);

		calls.length = 0;
		await pool.run('captions', task);
		await pool.run('captions', task);
		expect(calls).toEqual([B, A]);

		calls.length = 0;
		await pool.run('chapters', task).catch(() => null);
		expect(calls[0]).toBe('direct');
	});

	it('returns direct to use after the blocked cooldown (15m)', async () => {
		let directStatus = 429;
		const { pool, calls, task, clock } = poolWith(['direct', A], (e) => (e === 'direct' ? directStatus : 200));
		await pool.run('captions', task);
		directStatus = 200;
		clock.now += 14 * 60_000;
		calls.length = 0;
		await pool.run('captions', task);
		expect(calls).toEqual([A]);
		clock.now += 2 * 60_000;
		calls.length = 0;
		await pool.run('captions', task);
		expect(calls).toEqual(['direct']);
	});

	it('tries at most two routes per run, then reports unavailable', async () => {
		const { pool, calls, task } = poolWith(['direct', A, B], () => 429);
		await expect(pool.run('captions', task)).rejects.toBeInstanceOf(ProxyUnavailableError);
		expect(calls).toEqual(['direct', A]);
		calls.length = 0;
		await expect(pool.run('captions', task)).rejects.toBeInstanceOf(ProxyUnavailableError);
		expect(calls).toEqual([B]);
		calls.length = 0;
		await expect(pool.run('captions', task)).rejects.toBeInstanceOf(ProxyUnavailableError);
		expect(calls).toEqual([]);
	});

	it('treats 403 as blocked too', async () => {
		const { pool, calls, task } = poolWith(['direct', A], (e) => (e === 'direct' ? 403 : 200));
		await pool.run('captions', task);
		expect(calls).toEqual(['direct', A]);
	});

	it('cools a route down for a minute when it cannot connect', async () => {
		const { pool, calls, task, clock } = poolWith([A, B], (e) => (e === A ? new TypeError('fetch failed') : 200));
		await expect(pool.run('chapters', task)).resolves.toBe(200);
		expect(calls).toEqual([A, B]);
		expect(pool.snapshot()[0]?.cooling).toEqual({ chapters: 60_000 });
		clock.now += 61_000;
		expect(pool.snapshot()[0]?.cooling).toEqual({});
	});

	it('honours a blocked signal raised from a 200 response (bot check)', async () => {
		const { pool, calls } = poolWith(['direct', A], () => 200);
		const result = await pool.run('chapters', async (route) => {
			await route.fetch('https://www.youtube.com/youtubei/v1/player');
			if (route.direct) throw route.blocked('bot check');
			return 'ok';
		});
		expect(result).toBe('ok');
		expect(calls).toEqual(['direct', A]);
	});

	it('does not retry ordinary task errors on another route', async () => {
		const { pool, calls } = poolWith(['direct', A], () => 200);
		await expect(
			pool.run('captions', async (route) => {
				await route.fetch('https://www.youtube.com/x');
				throw new Error('parse failed');
			})
		).rejects.toThrow('parse failed');
		expect(calls).toEqual(['direct']);
	});

	it('keeps proxy credentials out of route ids', () => {
		const pool = new ProxyPool(['http://user:secret@10.0.0.28:3128'], { createFetch: () => vi.fn() });
		expect(pool.snapshot()[0]?.route).toBe('http://10.0.0.28:3128');
	});

	it('exposes RouteBlockedError from route.blocked()', () => {
		const pool = new ProxyPool(['direct'], { createFetch: () => vi.fn() });
		let error: unknown;
		void pool.run('x', async (route) => {
			error = route.blocked('bot check');
		});
		expect(error).toBeInstanceOf(RouteBlockedError);
	});
});
