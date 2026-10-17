import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from '@fastify/websocket';
import { ShardRegistry } from './shardRegistry.ts';
import type { DiscordNotifier } from '../utils/discordNotifier.ts';

const HEARTBEAT_TIMEOUT_MS = 60_000;

function createNotifierStub() {
	return {
		allShardsReady: vi.fn<(shardCount: number) => Promise<void>>().mockResolvedValue(undefined),
		shardHeartbeatTimeout: vi.fn<(wsId: string, shardIds: number[]) => Promise<void>>().mockResolvedValue(undefined)
	};
}

function fakeSocket(readyState = 1): WebSocket {
	return { send: vi.fn(), close: vi.fn(), readyState } as unknown as WebSocket;
}

describe('ShardRegistry', () => {
	let notifier: ReturnType<typeof createNotifierStub>;
	let registries: ShardRegistry[];

	function makeRegistry(shardCount: number, shardsPerProcess = 5): ShardRegistry {
		const registry = new ShardRegistry(shardCount, shardsPerProcess, notifier as unknown as DiscordNotifier);
		registries.push(registry);
		return registry;
	}

	function registerProcess(registry: ShardRegistry, wsId: string, shardIds: number[]): WebSocket {
		const socket = fakeSocket();
		registry.register(wsId, shardIds, socket, `host-${wsId}`);
		return socket;
	}

	beforeEach(() => {
		notifier = createNotifierStub();
		registries = [];
	});

	afterEach(() => {
		for (const registry of registries) registry.destroy();
		vi.useRealTimers();
	});

	describe('allocateShardIds', () => {
		it('allocates consecutive batches up to shardsPerProcess', () => {
			const registry = makeRegistry(4, 2);
			expect(registry.allocateShardIds()).toEqual([0, 1]);
			expect(registry.allocateShardIds()).toEqual([2, 3]);
		});

		it('returns null when all shard IDs are allocated', () => {
			const registry = makeRegistry(2, 2);
			expect(registry.allocateShardIds()).toEqual([0, 1]);
			expect(registry.allocateShardIds()).toBeNull();
			expect(registry.allocateShardIds()).toBeNull();
		});

		it('returns a partial batch when fewer than shardsPerProcess remain', () => {
			const registry = makeRegistry(3, 5);
			expect(registry.allocateShardIds()).toEqual([0, 1, 2]);
			expect(registry.allocateShardIds()).toBeNull();
		});

		it('makes released shards available for reallocation', () => {
			const registry = makeRegistry(4, 2);
			const first = registry.allocateShardIds()!;
			registerProcess(registry, 'ws-a', first);
			registry.release('ws-a');

			expect(registry.allocateShardIds()).toEqual([0, 1]);
		});

		it('skips already-allocated IDs in later batches', () => {
			const registry = makeRegistry(4, 1);
			expect(registry.allocateShardIds()).toEqual([0]);
			expect(registry.allocateShardIds()).toEqual([1]);
			expect(registry.allocateShardIds()).toEqual([2]);
			expect(registry.allocateShardIds()).toEqual([3]);
		});
	});

	describe('claimShards (re-identification)', () => {
		it('reserves claimed shard IDs so the next allocation skips them', () => {
			const registry = makeRegistry(4, 2);
			const first = registry.allocateShardIds()!;
			registerProcess(registry, 'ws-a', first);
			registry.release('ws-a');

			expect(registry.claimShards('ws-b', first)).toEqual(first);

			expect(registry.allocateShardIds()).toEqual([2, 3]);
		});

		it('keeps the re-identified process claimable by its original shard IDs', () => {
			const registry = makeRegistry(4, 2);
			const first = registry.allocateShardIds()!;
			registry.claimShards('ws-a', first);

			expect(registry.claimShards('ws-b', first)).toEqual(first);
			registerProcess(registry, 'ws-b', first);
			expect(registry.getProcess('ws-b')?.shardIds).toEqual(first);
			expect(registry.getProcessByShardId(first[0])?.wsId).toBe('ws-b');
		});

		it('rejects non-integer, out-of-range, and duplicate shard IDs', () => {
			const registry = makeRegistry(4, 2);
			expect(registry.claimShards('ws-a', [3.5])).toBeNull();
			expect(registry.claimShards('ws-a', [-1])).toBeNull();
			expect(registry.claimShards('ws-a', [4])).toBeNull();
			expect(registry.claimShards('ws-a', [0, 0])).toBeNull();
			// 거부된 claim은 아무것도 예약하지 않아야 해요
			expect(registry.allocateShardIds()).toEqual([0, 1]);
		});

		it('rejects claims for shards held by a live process (이중 점유/탈취 방지)', () => {
			const registry = makeRegistry(4, 2);
			const first = registry.allocateShardIds()!;
			registerProcess(registry, 'ws-a', first);

			expect(registry.claimShards('ws-b', [first[0]!])).toBeNull();
			expect(registry.getProcessByShardId(first[0]!)?.wsId).toBe('ws-a');
		});

		it('reclaims shards from a disconnected process without double-release', () => {
			const registry = makeRegistry(4, 2);
			const first = registry.allocateShardIds()!;
			registry.register('ws-a', first, fakeSocket(3), 'host-a'); // CLOSED 소켓 — close 이벤트가 아직 안 온 상태

			expect(registry.claimShards('ws-b', first)).toEqual(first);
			// 이전 주인의 release가 이미 넘어간 ID를 다시 해제하면 안 돼요
			expect(registry.release('ws-a')).toEqual([]);
			registerProcess(registry, 'ws-b', first);
			expect(registry.getProcessByShardId(first[0]!)?.wsId).toBe('ws-b');
			expect(registry.claimShards('ws-c', [first[0]!])).toBeNull();
		});

		it('reuses IDs left in the allocation set without an owner (유실 할당 자가 치유)', () => {
			const registry = makeRegistry(4, 2);
			// 등록 없이 예약만 된 상태(구버전 할당 누수 모방)
			expect(registry.claimShards('ws-gone', [0])).toEqual([0]);

			expect(registry.claimShards('ws-b', [0])).toEqual([0]);
			registerProcess(registry, 'ws-b', [0]);
			expect(registry.getProcessByShardId(0)?.wsId).toBe('ws-b');
		});
	});

	describe('release', () => {
		it('returns the released shard IDs and drops the process', () => {
			const registry = makeRegistry(4, 2);
			const first = registry.allocateShardIds()!;
			registerProcess(registry, 'ws-a', first);

			expect(registry.release('ws-a')).toEqual(first);
			expect(registry.getProcess('ws-a')).toBeUndefined();
		});

		it('returns undefined for an unknown wsId', () => {
			const registry = makeRegistry(4, 2);
			expect(registry.release('ws-ghost')).toBeUndefined();
		});
	});

	describe('heartbeat timeout release', () => {
		beforeEach(() => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
		});

		it('releases the process, closes its socket, and frees its shards', () => {
			const registry = makeRegistry(4, 2);
			const shardIds = registry.allocateShardIds()!;
			const socket = fakeSocket();
			registry.register('ws-a', shardIds, socket, 'host-a');

			vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS + 15_000);

			expect(notifier.shardHeartbeatTimeout).toHaveBeenCalledWith('ws-a', shardIds);
			expect(socket.close).toHaveBeenCalled();
			expect(registry.getProcess('ws-a')).toBeUndefined();

			// 해제된 샤드는 재할당 가능해야 한다
			expect(registry.allocateShardIds()).toEqual(shardIds);
		});

		it('keeps the process alive while heartbeats keep arriving', () => {
			const registry = makeRegistry(4, 2);
			const shardIds = registry.allocateShardIds()!;
			registerProcess(registry, 'ws-a', shardIds);

			vi.advanceTimersByTime(30_000);
			registry.heartbeat('ws-a');
			vi.advanceTimersByTime(30_000);

			expect(notifier.shardHeartbeatTimeout).not.toHaveBeenCalled();
			expect(registry.getProcess('ws-a')).toBeDefined();

			// 마지막 하트비트가 시간 초과되면 결국 해제된다
			vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS + 15_000);
			expect(notifier.shardHeartbeatTimeout).toHaveBeenCalledWith('ws-a', shardIds);
			expect(registry.getProcess('ws-a')).toBeUndefined();
		});
	});

	describe('checkAllShardsReady edge transition', () => {
		it('notifies once when the last process becomes ready', () => {
			const registry = makeRegistry(4, 2);
			const first = registry.allocateShardIds()!;
			registerProcess(registry, 'ws-a', first);
			const second = registry.allocateShardIds()!;
			registerProcess(registry, 'ws-b', second);

			registry.updateStatus('ws-a', 'ready');
			expect(notifier.allShardsReady).not.toHaveBeenCalled();

			registry.updateStatus('ws-b', 'ready');
			expect(notifier.allShardsReady).toHaveBeenCalledTimes(1);
			expect(notifier.allShardsReady).toHaveBeenCalledWith(4);
		});

		it('does not re-notify while all shards stay ready', () => {
			const registry = makeRegistry(2, 2);
			const shardIds = registry.allocateShardIds()!;
			registerProcess(registry, 'ws-a', shardIds);

			registry.updateStatus('ws-a', 'ready');
			registry.updateStatus('ws-a', 'ready');

			expect(notifier.allShardsReady).toHaveBeenCalledTimes(1);
		});

		it('re-notifies after a full not-ready to ready cycle', () => {
			const registry = makeRegistry(2, 2);
			const shardIds = registry.allocateShardIds()!;
			registerProcess(registry, 'ws-a', shardIds);

			registry.updateStatus('ws-a', 'ready');
			expect(notifier.allShardsReady).toHaveBeenCalledTimes(1);

			registry.updateStatus('ws-a', 'connecting');
			expect(notifier.allShardsReady).toHaveBeenCalledTimes(1);

			registry.updateStatus('ws-a', 'ready');
			expect(notifier.allShardsReady).toHaveBeenCalledTimes(2);
		});
	});
});
