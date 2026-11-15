import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '@sirubot/prisma';
import { createTicketService } from './ticketService.ts';

const makeService = () =>
	createTicketService({
		db: {} as PrismaClient,
		logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
		messages: { welcome: vi.fn(), notice: vi.fn() },
		uploadObject: vi.fn(async () => null)
	});

describe('TicketService 채널 정리 예약', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('유예 5초 뒤에 예약한 삭제를 실행해요', async () => {
		const service = makeService();
		const run = vi.fn(async () => undefined);
		service.scheduleChannelDelete('c1', run);
		await vi.advanceTimersByTimeAsync(4_999);
		expect(run).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('stop()은 남은 삭제를 기다리지 않고 지금 한 번만 실행해요', async () => {
		const service = makeService();
		const first = vi.fn(async () => undefined);
		const second = vi.fn(async () => undefined);
		service.scheduleChannelDelete('c1', first);
		service.scheduleChannelDelete('c2', second);

		await service.stop();
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);

		await vi.advanceTimersByTimeAsync(10_000);
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
	});

	it('stop() 뒤에 마감된 티켓은 타이머 없이 바로 지워요', async () => {
		const service = makeService();
		await service.stop();
		const run = vi.fn(async () => undefined);
		service.scheduleChannelDelete('c3', run);
		expect(run).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});
});
