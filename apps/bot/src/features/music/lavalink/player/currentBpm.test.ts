import { afterEach, describe, expect, it, vi } from 'vitest';
import { CurrentBpmCache } from './currentBpm.ts';
import type { MixerStateResponse } from '../../playback/mixerService.ts';

const state = (values: Partial<MixerStateResponse> = {}): MixerStateResponse => ({
	guildId: 'g',
	crossfadeEnabled: true,
	crossfadeMs: 5000,
	fadeInMs: 0,
	duckLevel: 1,
	...values
});
afterEach(() => vi.useRealTimers());
const flush = async () => {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
};

describe('current BPM cache', () => {
	it('refreshes a paused-style view when the request resolves without another tick, once per value change', async () => {
		vi.useFakeTimers();
		const cache = new CurrentBpmCache();
		const player = {};
		const node = {};
		const pending = Promise.withResolvers<MixerStateResponse>();
		const load = vi.fn(() => pending.promise);
		const refresh = vi.fn(() => {
			cache.read(player, node, 'a', load, refresh);
		});
		cache.read(player, node, 'a', load, refresh);
		pending.resolve(state({ currentTrackBpm: 120, currentTrackBpmIdentifier: 'a' }));
		await vi.advanceTimersByTimeAsync(0);
		expect(refresh).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(5000);
		cache.read(player, node, 'a', load, refresh);
		await vi.advanceTimersByTimeAsync(0);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('never blocks rendering, coalesces requests and caches a matching analysis', async () => {
		const cache = new CurrentBpmCache();
		const player = {};
		const node = {};
		const load = vi.fn(async () => state({ currentTrackBpm: 123.45, currentTrackBpmIdentifier: 'a' }));
		expect(cache.read(player, node, 'a', load)).toBeNull();
		expect(cache.read(player, node, 'a', load)).toBeNull();
		await flush();
		expect(cache.read(player, node, 'a', load)).toEqual({ identifier: 'a', bpm: 123.45 });
		expect(load).toHaveBeenCalledTimes(1);
		expect(load.mock.calls[0]).toHaveLength(1);
	});
	it('discards an analysis when the confirmed track or node changed during the request', async () => {
		const cache = new CurrentBpmCache();
		const player = {};
		const node = {};
		const result = Promise.withResolvers<MixerStateResponse>();
		const load = vi.fn(() => result.promise);
		cache.read(player, node, 'a', load);
		await flush();
		expect(cache.read(player, node, 'b', load)).toBeNull();
		result.resolve(state({ currentTrackBpm: 120, currentTrackBpmIdentifier: 'a' }));
		await flush();
		expect(cache.read(player, node, 'b', load)).toBeNull();
		expect(cache.read(player, {}, 'a', load)).toBeNull();
	});
	it.each([
		{},
		{ currentTrackBpm: null },
		{ currentTrackBpm: 120, currentTrackBpmIdentifier: 'other' },
		{ currentTrackBpm: NaN, currentTrackBpmIdentifier: 'a' }
	])('hides unavailable/invalid/stale analysis %j', async (fields) => {
		const cache = new CurrentBpmCache();
		const player = {};
		const node = {};
		const load = vi.fn(async () => state(fields));
		cache.read(player, node, 'a', load);
		await flush();
		expect(cache.read(player, node, 'a', load)).toBeNull();
	});
	it('hides errors and retries only after the poll interval', async () => {
		vi.useFakeTimers();
		const cache = new CurrentBpmCache();
		const player = {};
		const node = {};
		const load = vi.fn(async () => {
			throw new Error('unavailable');
		});
		cache.read(player, node, 'a', load);
		await flush();
		expect(cache.read(player, node, 'a', load)).toBeNull();
		expect(load).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(5000);
		cache.read(player, node, 'a', load);
		await flush();
		expect(load).toHaveBeenCalledTimes(2);
	});
});
