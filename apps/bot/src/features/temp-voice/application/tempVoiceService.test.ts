import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTempVoiceService, jtcEmptyGraceText, type TempVoiceServiceDeps } from './tempVoiceService.ts';

const mocks = vi.hoisted(() => ({
	getCacheHashFields: vi.fn(),
	setCacheHashFields: vi.fn(async () => undefined),
	deleteCacheHashField: vi.fn(async () => undefined),
	fetchChannel: vi.fn()
}));

const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

/** 평범한 가짜 deps로 만든 서비스 — Sapphire·Redis·Discord 없이 돌아가요 */
const makeService = (over: Partial<TempVoiceServiceDeps> = {}) =>
	createTempVoiceService({
		logger,
		settings: { getJtcSettings: vi.fn(), setJtcCategory: vi.fn() },
		roomStore: { getFields: mocks.getCacheHashFields, setFields: mocks.setCacheHashFields, deleteField: mocks.deleteCacheHashField },
		discord: { guildIds: () => ['g1'], fetchGuild: vi.fn(), fetchChannel: mocks.fetchChannel },
		messages: { notice: vi.fn() },
		emptyGraceMs: 30_000,
		...over
	});

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
		const service = makeService();
		await expect(service.restoreRooms()).resolves.toBe(false);
	});

	it('기록에 있는 채널이 사라졌으면 기록만 지운다', async () => {
		mocks.getCacheHashFields.mockResolvedValueOnce({ gone: 'u1' });
		mocks.fetchChannel.mockResolvedValueOnce(null);
		const service = makeService();

		await expect(service.restoreRooms()).resolves.toBe(true);
		expect(mocks.deleteCacheHashField).toHaveBeenCalledWith('jtc:rooms:g1', 'gone');
	});

	it('빈 방은 유예 후 삭제되고 기록도 사라진다 (재시작 전 고아 방 정리)', async () => {
		const channel = voiceChannel('room1', 0);
		mocks.getCacheHashFields.mockResolvedValueOnce({ room1: 'owner1' });
		mocks.fetchChannel.mockResolvedValue(channel);
		const service = makeService();

		await service.restoreRooms();
		await vi.advanceTimersByTimeAsync(30_000);

		expect(channel.delete).toHaveBeenCalledTimes(1);
		expect(mocks.deleteCacheHashField).toHaveBeenCalledWith('jtc:rooms:g1', 'room1');
	});

	it('사람이 있는 방은 삭제하지 않고 추적을 유지한다', async () => {
		const channel = voiceChannel('room2', 2);
		mocks.getCacheHashFields.mockResolvedValueOnce({ room2: 'owner2' });
		mocks.fetchChannel.mockResolvedValue(channel);
		const service = makeService();

		await service.restoreRooms();
		await vi.advanceTimersByTimeAsync(60_000);

		expect(channel.delete).not.toHaveBeenCalled();
	});

	it('추적 중인 방이 채널 삭제 이벤트로 끊기면 Redis 기록도 지운다', async () => {
		const channel = voiceChannel('room3', 1);
		mocks.getCacheHashFields.mockResolvedValueOnce({ room3: 'owner3' });
		mocks.fetchChannel.mockResolvedValue(channel);
		const service = makeService();

		await service.restoreRooms();
		service.handleChannelDelete('room3');

		expect(mocks.deleteCacheHashField).toHaveBeenCalledWith('jtc:rooms:g1', 'room3');
	});

	it('stop()은 빈방 확인 타이머를 해제해서 종료 뒤에 방을 지우지 않고, 이후 타이머도 만들지 않는다', async () => {
		const channel = voiceChannel('room4', 0);
		mocks.getCacheHashFields.mockResolvedValueOnce({ room4: 'owner4' });
		mocks.fetchChannel.mockResolvedValue(channel);
		const service = makeService();

		await service.restoreRooms();
		expect(vi.getTimerCount()).toBe(1);

		await service.stop();
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(channel.delete).not.toHaveBeenCalled();
	});
});

describe('TempVoiceService 복원 재시도', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('Redis가 늦게 연결되면 5초 간격으로 재시도해 복원해요', async () => {
		mocks.getCacheHashFields.mockResolvedValueOnce(null).mockResolvedValueOnce({});
		const service = makeService();
		await service.restoreWithRetry();
		expect(mocks.getCacheHashFields).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(mocks.getCacheHashFields).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('stop()은 대기 중인 재시도 타이머를 해제해요', async () => {
		mocks.getCacheHashFields.mockResolvedValue(null);
		const service = makeService();
		await service.restoreWithRetry();
		expect(vi.getTimerCount()).toBe(1);

		await service.stop();
		expect(vi.getTimerCount()).toBe(0);
		mocks.getCacheHashFields.mockClear();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mocks.getCacheHashFields).not.toHaveBeenCalled();
	});
});

describe('jtcEmptyGraceText', () => {
	it('유예 시간을 한국어로 표현해요', () => {
		expect(jtcEmptyGraceText(30_000)).toBe('30초');
		expect(jtcEmptyGraceText(60_000)).toBe('1분');
		expect(jtcEmptyGraceText(90_000)).toBe('1분 30초');
	});
});

describe('TempVoiceService 유예 시간 deps', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});
	afterEach(() => vi.useRealTimers());

	it('빈방은 deps로 받은 emptyGraceMs가 지난 뒤에 삭제해요', async () => {
		const channel = voiceChannel('room5', 0);
		mocks.getCacheHashFields.mockResolvedValueOnce({ room5: 'owner5' });
		mocks.fetchChannel.mockResolvedValue(channel);
		const service = makeService({ emptyGraceMs: 10_000 });

		await service.restoreRooms();
		await vi.advanceTimersByTimeAsync(9_999);
		expect(channel.delete).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(channel.delete).toHaveBeenCalledWith('임시 음성 채널: 10초간 비어 있음');
	});
});

describe('TempVoiceService 방 생성 실패 안내', () => {
	it('방을 만들지 못하면 마커 채널에 경고 안내를 포트로 렌더링해 보내요', async () => {
		const send = vi.fn(async () => undefined);
		const marker = { isTextBased: () => true, send };
		const create = vi.fn(async () => {
			throw new Error('boom');
		});
		const member = {
			id: 'm1',
			displayName: '시루',
			user: { bot: false },
			guild: { id: 'g1', channels: { create, cache: new Map([['marker', marker]]) } }
		};
		const rendered = { rendered: true };
		const notice = vi.fn(() => rendered);
		const service = makeService({
			settings: {
				getJtcSettings: vi.fn(async () => ({
					enabled: true,
					categoryId: null,
					markerChannelId: 'marker',
					template: '{user}의 방',
					userLimit: 0
				})),
				setJtcCategory: vi.fn()
			},
			messages: { notice: notice as never }
		});

		await service.handleVoiceState(
			{ channelId: null, guild: { id: 'g1' } } as never,
			{ channelId: 'marker', guild: { id: 'g1' }, member } as never
		);

		expect(notice).toHaveBeenCalledWith(
			expect.stringContaining('임시 음성 채널을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'),
			expect.any(Number)
		);
		expect(send).toHaveBeenCalledWith(rendered);
	});
});
