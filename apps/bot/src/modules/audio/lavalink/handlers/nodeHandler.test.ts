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
