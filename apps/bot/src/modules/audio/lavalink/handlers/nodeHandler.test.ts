import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeHandler } from './nodeHandler.ts';

const { getSubLogger } = vi.hoisted(() => ({ getSubLogger: vi.fn() }));
const stubLogger = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock('@sapphire/framework', () => ({ container: { logger: { getSubLogger } } }));

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
