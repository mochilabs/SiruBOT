import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPublishBotAdminResponse, mockGetSession, mockContainer } = vi.hoisted(() => {
	const publishFn = vi.fn();
	const getSessionFn = vi.fn();
	return {
		mockPublishBotAdminResponse: publishFn,
		mockGetSession: getSessionFn,
		mockContainer: {
			shardInfo: { shardIds: [0], shardCount: 1 },
			audio: null as unknown,
			appEmojiManager: null as unknown,
			stores: new Map(),
			redisStore: {
				publishBotAdminResponse: publishFn,
				getNodeSessionStore: () => ({ get: getSessionFn })
			}
		}
	};
});
vi.mock('@sapphire/framework', () => ({
	container: mockContainer
}));

import { unwrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { BotAdminResponder } from './botAdminResponder.ts';

const REQUEST_ID = 'c9d3a1b2-4e5f-4a6b-8c7d-2b1e3f4a5c61';

function createResponder(signingKey = 'secret-key') {
	const logger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	};
	return { responder: new BotAdminResponder(logger, signingKey), logger, signingKey };
}

describe('BotAdminResponder', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockContainer.shardInfo = { shardIds: [0], shardCount: 1 };
	});

	it('disconnects and reconnects the target Lavalink node with its existing sessionId', async () => {
		const disconnect = vi.fn();
		const connect = vi.fn();
		const nodes = new Map([
			[
				'main',
				{
					id: 'main',
					options: { id: 'main', host: '10.0.0.1', port: 2333 },
					connected: true,
					sessionId: 'sess-existing',
					heartBeatPing: 18,
					stats: {
						players: 2,
						playingPlayers: 1,
						uptime: 60000,
						memory: { used: 1024, reservable: 2048 },
						cpu: { lavalinkLoad: 0.1, systemLoad: 0.2 }
					},
					disconnect,
					connect
				}
			]
		]);
		mockContainer.audio = { nodeManager: { nodes } };

		const { responder, signingKey } = createResponder();
		await responder.handleRequest(
			JSON.stringify({
				requestId: REQUEST_ID,
				kind: 'node-reconnect',
				nodeId: 'main'
			})
		);

		expect(disconnect).toHaveBeenCalledWith('Admin panel manual reconnect');
		expect(connect).toHaveBeenCalledWith('sess-existing');
		expect(mockPublishBotAdminResponse).toHaveBeenCalledTimes(1);

		const unwrapped = unwrapRedisMessage(signingKey, mockPublishBotAdminResponse.mock.calls[0]![0] as string);
		expect(JSON.parse(unwrapped!)).toEqual(
			expect.objectContaining({
				requestId: REQUEST_ID,
				kind: 'node-reconnect',
				message: "노드 'main' 재연결을 요청했어요.",
				nodes: [expect.objectContaining({ id: 'main', host: '10.0.0.1', port: 2333 })]
			})
		);
	});

	it('falls back to Redis saved sessionId when node.sessionId is null', async () => {
		const disconnect = vi.fn();
		const connect = vi.fn();
		mockGetSession.mockResolvedValueOnce('sess-from-redis');
		const nodes = new Map([
			[
				'main',
				{
					id: 'main',
					options: { id: 'main', host: '10.0.0.1', port: 2333 },
					connected: false,
					sessionId: null,
					heartBeatPing: null,
					stats: null,
					disconnect,
					connect
				}
			]
		]);
		mockContainer.audio = { nodeManager: { nodes } };

		const { responder } = createResponder();
		await responder.handleRequest(
			JSON.stringify({
				requestId: REQUEST_ID,
				kind: 'node-reconnect',
				nodeId: 'main'
			})
		);

		expect(disconnect).not.toHaveBeenCalled();
		expect(connect).toHaveBeenCalledWith('sess-from-redis');
	});

	it('executes node reconnect on non-primary shard replicas without publishing duplicate responses', async () => {
		mockContainer.shardInfo = { shardIds: [1], shardCount: 2 };
		const connect = vi.fn();
		const nodes = new Map([
			[
				'main',
				{
					id: 'main',
					options: { id: 'main', host: '10.0.0.1', port: 2333 },
					connected: false,
					sessionId: 'sess-1',
					stats: null,
					disconnect: vi.fn(),
					connect
				}
			]
		]);
		mockContainer.audio = { nodeManager: { nodes } };

		const { responder } = createResponder();
		await responder.handleRequest(
			JSON.stringify({
				requestId: REQUEST_ID,
				kind: 'node-reconnect',
				nodeId: 'main'
			})
		);

		expect(connect).toHaveBeenCalledWith('sess-1');
		expect(mockPublishBotAdminResponse).not.toHaveBeenCalled();
	});
});
