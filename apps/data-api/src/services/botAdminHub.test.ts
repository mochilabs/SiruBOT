import { afterEach, describe, expect, it, vi } from 'vitest';
import { PendingRequestPool } from '@sirubot/utils';
import { correlateBotAdminResponse, type BotAdminPendingMeta, type BotAdminResult } from './botAdminHub.ts';

const REQUEST_ID = 'c9d3a1b2-4e5f-4a6b-8c7d-2b1e3f4a5c61';

function makeRegistry(capacity = 10) {
	const pendingMeta = new Map<string, BotAdminPendingMeta>();
	const pending = new PendingRequestPool<BotAdminResult>({
		capacity,
		timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
		onTimeout: (requestId) => pendingMeta.delete(requestId)
	});
	return {
		pending,
		pendingMeta,
		register(requestId: string, meta: BotAdminPendingMeta, timeoutMs = 1_000) {
			pendingMeta.set(requestId, meta);
			return pending.register(requestId, timeoutMs);
		},
		correlate(raw: string) {
			return correlateBotAdminResponse(raw, pending, pendingMeta);
		}
	};
}

describe('botAdminHub pending correlation', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('resolves a matching nodes-status response with node items', async () => {
		const reg = makeRegistry();
		const promise = reg.register(REQUEST_ID, { kind: 'nodes-status' });

		const outcome = reg.correlate(
			JSON.stringify({
				requestId: REQUEST_ID,
				kind: 'nodes-status',
				nodes: [
					{
						id: 'main',
						host: '127.0.0.1',
						port: 2333,
						connected: true,
						sessionId: 'sess-1',
						players: 3,
						playingPlayers: 2,
						uptimeMs: 12000,
						memoryUsedBytes: 1024,
						memoryReservableBytes: 4096,
						cpuLavalinkLoad: 0.12,
						cpuSystemLoad: 0.25,
						pingMs: 14
					}
				]
			})
		);

		expect(outcome).toBe('resolved');
		await expect(promise).resolves.toEqual({
			ok: true,
			nodes: [
				expect.objectContaining({
					id: 'main',
					connected: true,
					players: 3,
					playingPlayers: 2
				})
			],
			emojis: undefined,
			stores: undefined,
			message: undefined
		});
	});

	it('ignores responses whose kind does not match the pending request', () => {
		const reg = makeRegistry();
		void reg.register(REQUEST_ID, { kind: 'node-reconnect' });

		const outcome = reg.correlate(
			JSON.stringify({
				requestId: REQUEST_ID,
				kind: 'nodes-status',
				nodes: []
			})
		);

		expect(outcome).toBe('unmatched');
		expect(reg.pending.size).toBe(1);
	});

	it('propagates bot error messages as bot_error', async () => {
		const reg = makeRegistry();
		const promise = reg.register(REQUEST_ID, { kind: 'node-reconnect' });

		const outcome = reg.correlate(
			JSON.stringify({
				requestId: REQUEST_ID,
				kind: 'node-reconnect',
				error: "노드 'missing'을(를) 찾을 수 없어요."
			})
		);

		expect(outcome).toBe('resolved');
		await expect(promise).resolves.toEqual({
			ok: false,
			reason: 'bot_error',
			message: "노드 'missing'을(를) 찾을 수 없어요."
		});
	});
});
