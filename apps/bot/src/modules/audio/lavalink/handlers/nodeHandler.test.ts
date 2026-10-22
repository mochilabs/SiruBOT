import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { container } from '@sapphire/framework';
import { NodeHandler } from './nodeHandler.ts';

const { getSubLogger, reportNodeEvent } = vi.hoisted(() => ({ getSubLogger: vi.fn(), reportNodeEvent: vi.fn() }));
const stubLogger = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock('@sapphire/framework', () => ({ container: { logger: { getSubLogger } } }));
vi.mock('../../../../services/playbackReporter.ts', () => ({ reportNodeEvent }));

function makeHandler() {
	const nodeManager = { on: vi.fn() };
	return new NodeHandler(nodeManager as never) as unknown as { [key: string]: any };
}

const NOW = new Date('2026-10-14T12:00:00Z').getTime();

describe('estimatePosition (crash-restore freshness)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		getSubLogger.mockReturnValue(stubLogger);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns 0 when there is no usable base position', () => {
		const handler = makeHandler();
		expect(handler.sessionRestore.estimatePosition({ position: 0, lastPosition: 0, lastPositionChange: NOW, savedAt: NOW })).toBe(0);
	});

	it('returns 0 when no timestamp is available to extrapolate from', () => {
		const handler = makeHandler();
		expect(handler.sessionRestore.estimatePosition({ position: 60_000, lastPosition: 60_000 })).toBe(0);
	});

	it('extrapolates the position by the elapsed time since the last known state', () => {
		const handler = makeHandler();
		const saved = { position: 60_000, lastPosition: 60_000, lastPositionChange: NOW - 10_000, savedAt: NOW - 10_000 };
		expect(handler.sessionRestore.estimatePosition(saved)).toBe(70_000);
	});

	it('prefers lastPosition and lastPositionChange over position/savedAt', () => {
		const handler = makeHandler();
		const saved = { position: 1_000, lastPosition: 60_000, lastPositionChange: NOW - 30_000, savedAt: NOW - 600_000 };
		expect(handler.sessionRestore.estimatePosition(saved)).toBe(90_000);
	});

	it('clamps a saved timestamp in the future back to the base position', () => {
		const handler = makeHandler();
		const saved = { position: 60_000, lastPosition: 60_000, lastPositionChange: NOW + 5_000, savedAt: NOW + 5_000 };
		expect(handler.sessionRestore.estimatePosition(saved)).toBe(60_000);
	});

	it('stops extrapolating beyond the fresh-restore window (6h) and keeps the base position', () => {
		const handler = makeHandler();
		const sevenHoursAgo = NOW - 7 * 60 * 60 * 1000;
		const saved = { position: 60_000, lastPosition: 60_000, lastPositionChange: sevenHoursAgo, savedAt: sevenHoursAgo };
		expect(handler.sessionRestore.estimatePosition(saved)).toBe(60_000);
	});
});

describe('node event reporting (상태 페이지 최근 오류)', () => {
	beforeEach(() => {
		getSubLogger.mockReturnValue(stubLogger);
		reportNodeEvent.mockClear();
		// handleNodeDisconnect의 플레이어 마이그레이션 분기를 타지 않도록 빈 스웜을 넣어요
		Object.assign(container, {
			audio: {
				players: { filter: () => ({ values: () => ({ toArray: () => [] }) }) },
				nodeManager: { leastUsedNodes: () => [] }
			}
		});
	});

	it('reports node disconnect with the close reason', () => {
		const handler = makeHandler();
		handler.handleNodeDisconnect({ id: 'main', options: { id: 'main' } }, { code: 1006, reason: 'closed' });
		expect(reportNodeEvent).toHaveBeenCalledWith('main', 'node_disconnect', 'closed');
	});

	it('falls back to the close code when there is no reason text', () => {
		const handler = makeHandler();
		handler.handleNodeDisconnect({ id: 'main', options: { id: 'main' } }, { code: 1006 });
		expect(reportNodeEvent).toHaveBeenCalledWith('main', 'node_disconnect', 'code 1006');
	});

	it('reports node errors with the error message', () => {
		const handler = makeHandler();
		handler.handleNodeError({ id: 'main', options: { id: 'main' } }, new Error('boom'), {});
		expect(reportNodeEvent).toHaveBeenCalledWith('main', 'node_error', 'boom');
	});
});

describe('mixer op handling (raw + error)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		getSubLogger.mockReturnValue(stubLogger);
		reportNodeEvent.mockClear();
		stubLogger.debug.mockClear();
		stubLogger.error.mockClear();
		Object.assign(container, {
			mixerService: { observeMixerEvent: vi.fn() }
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('mixer op를 MixerService에 넘기고 ready 복구는 돌리지 않는다', () => {
		const handler = makeHandler();
		const payload = { op: 'mixer', type: 'overlapEnd', reason: 'aborted', guildId: '123' };
		handler.handleNodeRaw({ id: 'main', options: { id: 'main' }, sessionId: 's1' }, payload);

		expect(container.mixerService.observeMixerEvent).toHaveBeenCalledWith(payload);
		expect(handler.sessionRestore.restoreTimers.size).toBe(0);
	});

	it('ready op는 여전히 세션 복구 타이머를 건다', () => {
		const handler = makeHandler();
		handler.handleNodeRaw({ id: 'main', options: { id: 'main' }, sessionId: 's1' }, { op: 'ready', resumed: true });

		expect(container.mixerService.observeMixerEvent).not.toHaveBeenCalled();
		expect(handler.sessionRestore.restoreTimers.size).toBe(1);
	});

	it('lavalink-client가 모르는 mixer op 오류는 debug로만 남긴다', () => {
		const handler = makeHandler();
		handler.handleNodeError({ id: 'main', options: { id: 'main' } }, new Error('Unexpected op "mixer" with data'), { op: 'mixer' });

		expect(stubLogger.debug).toHaveBeenCalled();
		expect(stubLogger.error).not.toHaveBeenCalled();
		expect(reportNodeEvent).not.toHaveBeenCalled();
	});
});

describe('handleReadyOp (ready op → 엔진 위임)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		getSubLogger.mockReturnValue(stubLogger);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('다음 턴에 세션을 저장하고 resume을 연장한 뒤 fresh 복구를 트리거한다', async () => {
		const handler = makeHandler();
		const engine = handler.sessionRestore;
		const saveNodeSession = vi.fn(async () => undefined);
		const restoreFreshSession = vi.fn(async () => undefined);
		engine.saveNodeSession = saveNodeSession;
		engine.restoreFreshSession = restoreFreshSession;
		const updateSession = vi.fn().mockResolvedValue(undefined);
		const node = { id: 'main', sessionId: 's2', options: { id: 'main' }, updateSession };

		engine.handleReadyOp(node, true);

		// ready 직후가 아니라 다음 턴에서 실행된다(lavalink-client의 sessionId 배정 순서 때문).
		expect(saveNodeSession).not.toHaveBeenCalled();
		expect(engine.restoreTimers.size).toBe(1);

		await vi.advanceTimersByTimeAsync(0);

		expect(saveNodeSession).toHaveBeenCalledWith(node);
		expect(updateSession).toHaveBeenCalledWith(true, 300);
		expect(restoreFreshSession).toHaveBeenCalledWith(node);
		expect(engine.restoreTimers.size).toBe(0);
	});

	it('이전 세션을 이어(resumed=true) 쓰면 fresh 복구는 하지 않는다', async () => {
		const handler = makeHandler();
		const engine = handler.sessionRestore;
		const restoreFreshSession = vi.fn(async () => undefined);
		engine.restoreFreshSession = restoreFreshSession;

		engine.handleReadyOp({ id: 'main', sessionId: 's2', options: { id: 'main' }, updateSession: vi.fn().mockResolvedValue(undefined) }, false);
		await vi.advanceTimersByTimeAsync(0);

		expect(restoreFreshSession).not.toHaveBeenCalled();
	});
});

describe('mixer reconcile after restore (재시작 뒤 예열 슬롯 복구)', () => {
	beforeEach(() => {
		getSubLogger.mockReturnValue(stubLogger);
		reportNodeEvent.mockClear();
	});

	it('session resume 복구가 끝나면 mixer 상태를 서버와 맞춘다', async () => {
		const handler = makeHandler();
		const createdPlayer = { queue: { current: null }, paused: false, playing: false, lastPosition: 0, lastPositionChange: 0, ping: {} };
		handler.sessionRestore.recreateSavedPlayer = vi.fn().mockResolvedValue(createdPlayer);
		const reconcile = vi.fn().mockResolvedValue(undefined);
		Object.assign(container, {
			audio: {
				players: { has: () => false },
				options: {},
				utils: { buildTrack: vi.fn().mockReturnValue({ info: { identifier: 'a' }, requester: {} }) }
			},
			client: { user: { id: 'bot' } },
			mixerService: { reconcileAfterResume: reconcile }
		});

		const node = { options: { id: 'main' } };
		const lavalinkPlayer = {
			guildId: 'g1',
			state: { time: NOW, position: 10_000, ping: 1 },
			volume: 100,
			paused: false,
			track: { encoded: 'x' }
		};
		const playerSaver = { get: vi.fn().mockResolvedValue({ options: {} }), delete: vi.fn() };

		await handler.sessionRestore.resumeSinglePlayer(node, lavalinkPlayer, playerSaver, NOW);

		expect(reconcile).toHaveBeenCalledTimes(1);
		expect(reconcile).toHaveBeenCalledWith(createdPlayer);
	});

	it('resume 복구에서 reconcile이 실패해도 복구 자체는 완료된다', async () => {
		const handler = makeHandler();
		const createdPlayer = { queue: { current: null }, paused: false, playing: false, lastPosition: 0, lastPositionChange: 0, ping: {} };
		handler.sessionRestore.recreateSavedPlayer = vi.fn().mockResolvedValue(createdPlayer);
		const reconcile = vi.fn().mockRejectedValue(new Error('mixer unreachable'));
		Object.assign(container, {
			audio: {
				players: { has: () => false },
				options: {},
				utils: { buildTrack: vi.fn().mockReturnValue({ info: { identifier: 'a' }, requester: {} }) }
			},
			client: { user: { id: 'bot' } },
			mixerService: { reconcileAfterResume: reconcile }
		});

		const node = { options: { id: 'main' } };
		const lavalinkPlayer = { guildId: 'g1', state: { time: NOW, position: 10_000, ping: 1 }, volume: 100, paused: false, track: null };
		const playerSaver = { get: vi.fn().mockResolvedValue({ options: {} }), delete: vi.fn() };

		await expect(handler.sessionRestore.resumeSinglePlayer(node, lavalinkPlayer, playerSaver, NOW)).resolves.toBeUndefined();
		expect(reconcile).toHaveBeenCalledTimes(1);
	});

	it('fresh 복구가 끝나면 mixer 상태를 서버와 맞춘다', async () => {
		const handler = makeHandler();
		const createdPlayer = {
			queue: { current: { info: { duration: 100_000 } } },
			play: vi.fn().mockResolvedValue(null),
			seek: vi.fn().mockResolvedValue(null),
			pause: vi.fn().mockResolvedValue(null),
			destroy: vi.fn()
		};
		handler.sessionRestore.recreateSavedPlayer = vi.fn().mockResolvedValue(createdPlayer);
		const reconcile = vi.fn().mockResolvedValue(undefined);
		Object.assign(container, {
			mixerService: { reconcileAfterResume: reconcile, markFiltersStale: vi.fn(), primeForPlay: vi.fn().mockResolvedValue(null) },
			redisStore: { getPlayerSaver: vi.fn() }
		});

		const saved = { paused: false, position: 50_000, lastPosition: 50_000, lastPositionChange: NOW - 1_000, savedAt: NOW - 1_000 };

		await handler.sessionRestore.restoreFreshPlayer({ options: { id: 'main' } }, 'g1', saved);

		expect(createdPlayer.play).toHaveBeenCalledWith({ noReplace: true });
		expect(reconcile).toHaveBeenCalledTimes(1);
		expect(reconcile).toHaveBeenCalledWith(createdPlayer);
	});
});

describe('restoreFreshSession (샤드 소유 필터 · 병렬 복구)', () => {
	// (id >> 22) % 2 가 각각 1, 0 이 되도록 만든 길드 id (샤드 분리 운영 재현용)
	const SHARD1_GUILD = String(1n << 22n);
	const SHARD0_GUILD = String(2n << 22n);

	beforeEach(() => {
		getSubLogger.mockReturnValue(stubLogger);
	});

	// shardInfo는 이 파일이 새로 심는 전역 상태 — 이후 파일이 단일 인스턴스로 오인하지 않게 되돌린다.
	afterEach(() => {
		(container as unknown as Record<string, unknown>).shardInfo = undefined;
	});

	it('다른 샤드(레플리카) 소유 길드는 복구 후보에서 제외한다', async () => {
		const handler = makeHandler();
		const restoreFreshGuild = vi.fn(async (_node: unknown, guildId: string) => {
			void guildId;
		});
		handler.sessionRestore.restoreFreshGuild = restoreFreshGuild;
		Object.assign(container, {
			shardInfo: { shardIds: [0], shardCount: 2 },
			client: { guilds: { cache: new Map([[SHARD0_GUILD, {}]]) } },
			redisStore: { getPlayerSaver: () => ({ listGuildIds: async () => [SHARD0_GUILD, SHARD1_GUILD] }) }
		});

		await handler.sessionRestore.restoreFreshSession({ options: { id: 'main' } });

		// 남의 길드는 캐시에 없어 90초 폴링을 통째로 소모했다 — 소유 길드만 복구한다.
		expect(restoreFreshGuild).toHaveBeenCalledTimes(1);
		expect(restoreFreshGuild.mock.calls[0][1]).toBe(SHARD0_GUILD);
	});

	it('샤드 정보가 없으면(단일 인스턴스) 모든 길드를 후보로 남긴다', async () => {
		const handler = makeHandler();
		const restoreFreshGuild = vi.fn(async (_node: unknown, guildId: string) => {
			void guildId;
		});
		handler.sessionRestore.restoreFreshGuild = restoreFreshGuild;
		Object.assign(container, {
			shardInfo: undefined,
			client: { guilds: { cache: new Map([[SHARD0_GUILD, {}]]) } },
			redisStore: { getPlayerSaver: () => ({ listGuildIds: async () => [SHARD0_GUILD, SHARD1_GUILD] }) }
		});

		await handler.sessionRestore.restoreFreshSession({ options: { id: 'main' } });

		expect(restoreFreshGuild).toHaveBeenCalledTimes(2);
	});
});

describe('fresh 복구 신선도 판정 (세션 시작 시점 기준)', () => {
	const SIX_HOURS = 6 * 60 * 60 * 1000;

	beforeEach(() => {
		getSubLogger.mockReturnValue(stubLogger);
		Object.assign(container, { audio: { players: { has: () => false } } });
	});

	function stubRestore(handler: ReturnType<typeof makeHandler>) {
		handler.sessionRestore.isVoiceChannelOccupied = vi.fn(async () => true);
		handler.sessionRestore.restoreFreshPlayer = vi.fn(async () => undefined);
		handler.sessionRestore.discardSavedPlayer = vi.fn(async () => undefined);
	}

	it('복구가 세션 시작 뒤로 밀려도 신선도는 세션 시작 시점으로 판정한다', async () => {
		const handler = makeHandler();
		stubRestore(handler);
		const now = Date.now();
		// 세션 시작 70분 뒤에야 복구가 도착하는 상황 — 저장값은 세션 시작 시점 기준 5h55m 전(신선),
		// 지금 시각 기준으로는 6h55m 전(구판 기준이라면 이미 폐기됐을 값).
		const sessionStartedAt = now - 70 * 60_000;
		const savedAt = sessionStartedAt - (SIX_HOURS - 5 * 60_000);
		const playerSaver = { get: vi.fn(async () => ({ savedAt, voiceChannelId: 'vc-1' })), delete: vi.fn() };

		await handler.sessionRestore.restoreFreshGuild(
			{ options: { id: 'main' } },
			'g1',
			playerSaver as never,
			sessionStartedAt,
			Promise.resolve(true)
		);

		expect(handler.sessionRestore.discardSavedPlayer).not.toHaveBeenCalled();
		expect(handler.sessionRestore.restoreFreshPlayer).toHaveBeenCalled();
	});

	it('세션 시작 시점에도 이미 6h를 넘긴 기록은 폐기한다', async () => {
		const handler = makeHandler();
		stubRestore(handler);
		const sessionStartedAt = Date.now();
		const savedAt = sessionStartedAt - SIX_HOURS - 1;
		const playerSaver = { get: vi.fn(async () => ({ savedAt, voiceChannelId: 'vc-1' })), delete: vi.fn() };

		await handler.sessionRestore.restoreFreshGuild(
			{ options: { id: 'main' } },
			'g1',
			playerSaver as never,
			sessionStartedAt,
			Promise.resolve(true)
		);

		expect(handler.sessionRestore.discardSavedPlayer).toHaveBeenCalled();
		expect(handler.sessionRestore.restoreFreshPlayer).not.toHaveBeenCalled();
	});

	it('길드 캐시가 안 오면 기록을 지우지 않고 다음 재시작으로 넘긴다', async () => {
		const handler = makeHandler();
		stubRestore(handler);
		const sessionStartedAt = Date.now();
		const playerSaver = { get: vi.fn(async () => ({ savedAt: sessionStartedAt, voiceChannelId: 'vc-1' })), delete: vi.fn() };

		await handler.sessionRestore.restoreFreshGuild(
			{ options: { id: 'main' } },
			'g1',
			playerSaver as never,
			sessionStartedAt,
			Promise.resolve(false)
		);

		expect(handler.sessionRestore.restoreFreshPlayer).not.toHaveBeenCalled();
		expect(handler.sessionRestore.discardSavedPlayer).not.toHaveBeenCalled();
		expect(playerSaver.delete).not.toHaveBeenCalled();
	});
});
