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
		expect(handler.estimatePosition({ position: 0, lastPosition: 0, lastPositionChange: NOW, savedAt: NOW })).toBe(0);
	});

	it('returns 0 when no timestamp is available to extrapolate from', () => {
		const handler = makeHandler();
		expect(handler.estimatePosition({ position: 60_000, lastPosition: 60_000 })).toBe(0);
	});

	it('extrapolates the position by the elapsed time since the last known state', () => {
		const handler = makeHandler();
		const saved = { position: 60_000, lastPosition: 60_000, lastPositionChange: NOW - 10_000, savedAt: NOW - 10_000 };
		expect(handler.estimatePosition(saved)).toBe(70_000);
	});

	it('prefers lastPosition and lastPositionChange over position/savedAt', () => {
		const handler = makeHandler();
		const saved = { position: 1_000, lastPosition: 60_000, lastPositionChange: NOW - 30_000, savedAt: NOW - 600_000 };
		expect(handler.estimatePosition(saved)).toBe(90_000);
	});

	it('clamps a saved timestamp in the future back to the base position', () => {
		const handler = makeHandler();
		const saved = { position: 60_000, lastPosition: 60_000, lastPositionChange: NOW + 5_000, savedAt: NOW + 5_000 };
		expect(handler.estimatePosition(saved)).toBe(60_000);
	});

	it('stops extrapolating beyond the fresh-restore window (6h) and keeps the base position', () => {
		const handler = makeHandler();
		const sevenHoursAgo = NOW - 7 * 60 * 60 * 1000;
		const saved = { position: 60_000, lastPosition: 60_000, lastPositionChange: sevenHoursAgo, savedAt: sevenHoursAgo };
		expect(handler.estimatePosition(saved)).toBe(60_000);
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
		expect(handler.restoreTimers.size).toBe(0);
	});

	it('ready op는 여전히 세션 복구 타이머를 건다', () => {
		const handler = makeHandler();
		handler.handleNodeRaw({ id: 'main', options: { id: 'main' }, sessionId: 's1' }, { op: 'ready', resumed: true });

		expect(container.mixerService.observeMixerEvent).not.toHaveBeenCalled();
		expect(handler.restoreTimers.size).toBe(1);
	});

	it('lavalink-client가 모르는 mixer op 오류는 debug로만 남긴다', () => {
		const handler = makeHandler();
		handler.handleNodeError({ id: 'main', options: { id: 'main' } }, new Error('Unexpected op "mixer" with data'), { op: 'mixer' });

		expect(stubLogger.debug).toHaveBeenCalled();
		expect(stubLogger.error).not.toHaveBeenCalled();
		expect(reportNodeEvent).not.toHaveBeenCalled();
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
		handler.recreateSavedPlayer = vi.fn().mockResolvedValue(createdPlayer);
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

		await handler.resumeSinglePlayer(node, lavalinkPlayer, playerSaver, NOW);

		expect(reconcile).toHaveBeenCalledTimes(1);
		expect(reconcile).toHaveBeenCalledWith(createdPlayer);
	});

	it('resume 복구에서 reconcile이 실패해도 복구 자체는 완료된다', async () => {
		const handler = makeHandler();
		const createdPlayer = { queue: { current: null }, paused: false, playing: false, lastPosition: 0, lastPositionChange: 0, ping: {} };
		handler.recreateSavedPlayer = vi.fn().mockResolvedValue(createdPlayer);
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

		await expect(handler.resumeSinglePlayer(node, lavalinkPlayer, playerSaver, NOW)).resolves.toBeUndefined();
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
		handler.recreateSavedPlayer = vi.fn().mockResolvedValue(createdPlayer);
		const reconcile = vi.fn().mockResolvedValue(undefined);
		Object.assign(container, {
			mixerService: { reconcileAfterResume: reconcile, markFiltersStale: vi.fn(), primeForPlay: vi.fn().mockResolvedValue(null) },
			redisStore: { getPlayerSaver: vi.fn() }
		});

		const saved = { paused: false, position: 50_000, lastPosition: 50_000, lastPositionChange: NOW - 1_000, savedAt: NOW - 1_000 };

		await handler.restoreFreshPlayer({ options: { id: 'main' } }, 'g1', saved);

		expect(createdPlayer.play).toHaveBeenCalledWith({ noReplace: true });
		expect(reconcile).toHaveBeenCalledTimes(1);
		expect(reconcile).toHaveBeenCalledWith(createdPlayer);
	});
});
