import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPublish, mockGetSession, mockContainer } = vi.hoisted(() => {
	const publishFn = vi.fn();
	const getSessionFn = vi.fn();
	return {
		mockPublish: publishFn,
		mockGetSession: getSessionFn,
		mockContainer: {
			shardInfo: { shardIds: [0], shardCount: 1 },
			audio: null as unknown,
			appEmojiManager: null as unknown,
			stores: new Map(),
			redisStore: {
				getNodeSessionStore: () => ({ get: getSessionFn })
			}
		}
	};
});
vi.mock('@sapphire/framework', () => ({
	container: mockContainer
}));
// 공개 표면 전체(피스 포함)를 불러오지 않고 shard 키 계산만 실제 구현을 써요
vi.mock('../../music/index.ts', async () => ({
	NodeSessionStore: (await import('../../music/lavalink/redisStore.ts')).NodeSessionStore
}));

import type { RedisRuntime } from '../../../lib/redisResponder.ts';
import { createBotAdminResponder } from './botAdmin.ts';

const REQUEST_ID = 'c9d3a1b2-4e5f-4a6b-8c7d-2b1e3f4a5c61';

/** 서명 없는(개발용) 모드로 요청을 흘려 넣어요 — 서명 검증 자체는 lib/redisResponder.test.ts가 잠가요 */
function createResponder() {
	const logger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	};
	const binding = createBotAdminResponder();
	const runtime: RedisRuntime = { logger, signingKey: '', publisher: { publish: mockPublish }, resolveGuild: () => undefined };
	return { responder: { handleRequest: (raw: string) => binding.handle(raw, runtime) }, logger };
}

describe('봇 관리자 응답자', () => {
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

		const { responder } = createResponder();
		await responder.handleRequest(
			JSON.stringify({
				requestId: REQUEST_ID,
				kind: 'node-reconnect',
				nodeId: 'main'
			})
		);

		expect(disconnect).toHaveBeenCalledWith('Admin panel manual reconnect');
		expect(connect).toHaveBeenCalledWith('sess-existing');
		expect(mockPublish).toHaveBeenCalledTimes(1);

		expect(mockPublish.mock.calls[0]![0]).toBe('sirubot:bot-admin:response');
		expect(mockPublish.mock.calls[0]![1]).toEqual(
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
		expect(mockPublish).not.toHaveBeenCalled();
	});
});
