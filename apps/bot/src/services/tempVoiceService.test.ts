import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getCacheHashFields: vi.fn(),
	setCacheHashFields: vi.fn(async () => undefined),
	deleteCacheHashField: vi.fn(async () => undefined),
	fetchChannel: vi.fn()
}));

vi.mock('@sapphire/framework', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@sapphire/framework')>();
	return {
		...actual,
		container: {
			...actual.container,
			client: {
				guilds: { cache: new Map([['g1', { id: 'g1' }]]) },
				channels: { fetch: mocks.fetchChannel }
			},
			redisStore: {
				getCacheHashFields: mocks.getCacheHashFields,
				setCacheHashFields: mocks.setCacheHashFields,
				deleteCacheHashField: mocks.deleteCacheHashField
			},
			logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
		}
	};
});

import { TempVoiceService } from './tempVoiceService.ts';

/** 음성 채널 흉내 — members.filter 결과에 size가 있어야 서비스 코드가 동작해요 */
function voiceChannel(id: string, humanCount: number) {
	const members = Array.from({ length: humanCount }, (_, i) => ({ id: `u${i}`, user: { bot: false } }));
	return {
		id,
		isVoiceBased: () => true,
		members: { filter: (fn: (m: unknown) => boolean) => Object.assign(members.filter(fn), { size: members.filter(fn).length }) },
		delete: vi.fn(async () => undefined)
	};
}

describe('TempVoiceService room restore', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('Redis가 아직 연결되지 않았으면 false를 돌려줘 재시도를 요청한다', async () => {
		mocks.getCacheHashFields.mockResolvedValueOnce(null);
		const service = new TempVoiceService();
		await expect(service.restoreRooms()).resolves.toBe(false);
	});

	it('기록에 있는 채널이 사라졌으면 기록만 지운다', async () => {
		mocks.getCacheHashFields.mockResolvedValueOnce({ gone: 'u1' });
		mocks.fetchChannel.mockResolvedValueOnce(null);
		const service = new TempVoiceService();

		await expect(service.restoreRooms()).resolves.toBe(true);
		expect(mocks.deleteCacheHashField).toHaveBeenCalledWith('jtc:rooms:g1', 'gone');
	});

	it('빈 방은 유예 후 삭제되고 기록도 사라진다 (재시작 전 고아 방 정리)', async () => {
		const channel = voiceChannel('room1', 0);
		mocks.getCacheHashFields.mockResolvedValueOnce({ room1: 'owner1' });
		mocks.fetchChannel.mockResolvedValue(channel);
		const service = new TempVoiceService();

		await service.restoreRooms();
		await vi.advanceTimersByTimeAsync(30_000);

		expect(channel.delete).toHaveBeenCalledTimes(1);
		expect(mocks.deleteCacheHashField).toHaveBeenCalledWith('jtc:rooms:g1', 'room1');
	});

	it('사람이 있는 방은 삭제하지 않고 추적을 유지한다', async () => {
		const channel = voiceChannel('room2', 2);
		mocks.getCacheHashFields.mockResolvedValueOnce({ room2: 'owner2' });
		mocks.fetchChannel.mockResolvedValue(channel);
		const service = new TempVoiceService();

		await service.restoreRooms();
		await vi.advanceTimersByTimeAsync(60_000);

		expect(channel.delete).not.toHaveBeenCalled();
	});

	it('추적 중인 방이 채널 삭제 이벤트로 끊기면 Redis 기록도 지운다', async () => {
		const channel = voiceChannel('room3', 1);
		mocks.getCacheHashFields.mockResolvedValueOnce({ room3: 'owner3' });
		mocks.fetchChannel.mockResolvedValue(channel);
		const service = new TempVoiceService();

		await service.restoreRooms();
		service.handleChannelDelete('room3');

		expect(mocks.deleteCacheHashField).toHaveBeenCalledWith('jtc:rooms:g1', 'room3');
	});
});
