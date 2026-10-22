import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getCacheHashFields: vi.fn(),
	setCacheHashFields: vi.fn(),
	deleteCacheValue: vi.fn()
}));

vi.mock('@sapphire/framework', () => ({
	container: {
		redisStore: {
			getCacheHashFields: mocks.getCacheHashFields,
			setCacheHashFields: mocks.setCacheHashFields,
			deleteCacheValue: mocks.deleteCacheValue
		}
	}
}));

import { countingStateKey, loadCountingState, resetCountingState, saveCountingState } from './countingState.ts';

/** 예약된 write-behind flush가 돌아갈 때까지 한 틱 기다려요 */
const flushTick = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(async () => {
	// 이전 테스트의 예약된 flush가 새 테스트의 호출 기록을 더럽히지 않게 비워요
	await flushTick();
	vi.resetAllMocks();
	mocks.getCacheHashFields.mockResolvedValue(null);
	mocks.setCacheHashFields.mockResolvedValue(undefined);
	mocks.deleteCacheValue.mockResolvedValue(undefined);
});

describe('countingState write-behind', () => {
	it('Redis 쓰기를 기다리지 않고 즉시 반환하고 마지막 상태만 flush해요', async () => {
		saveCountingState('wb-basic', { current: 1, lastUserId: 'u1', best: 1 });
		saveCountingState('wb-basic', { current: 2, lastUserId: 'u2', best: 2 });

		// hot path는 Redis 왕복을 기다리지 않아요
		expect(mocks.setCacheHashFields).not.toHaveBeenCalled();
		// 메모리는 이미 최신이에요
		expect(await loadCountingState('wb-basic')).toEqual({ current: 2, lastUserId: 'u2', best: 2 });

		await flushTick();
		expect(mocks.setCacheHashFields).toHaveBeenCalledTimes(1);
		expect(mocks.setCacheHashFields).toHaveBeenCalledWith(countingStateKey('wb-basic'), {
			current: '2',
			lastUserId: 'u2',
			best: '2'
		});
	});

	it('flush가 실패해도 다음 저장이 그대로 이어져요', async () => {
		mocks.setCacheHashFields.mockRejectedValueOnce(new Error('redis down'));

		saveCountingState('wb-flaky', { current: 1, lastUserId: 'u1', best: 1 });
		// 재시도하지 않고 실패를 조용히 흘려보내요 (메모리가 최신이라 다음 저장이 덮어써요)
		await flushTick();
		expect(mocks.setCacheHashFields).toHaveBeenCalledTimes(1);

		saveCountingState('wb-flaky', { current: 2, lastUserId: 'u2', best: 2 });
		await flushTick();
		expect(mocks.setCacheHashFields).toHaveBeenLastCalledWith(countingStateKey('wb-flaky'), {
			current: '2',
			lastUserId: 'u2',
			best: '2'
		});
	});

	it('초기화 뒤에 예약된 flush는 삭제된 상태를 되살리지 않아요', async () => {
		saveCountingState('wb-reset', { current: 1, lastUserId: 'u1', best: 1 });
		await resetCountingState('wb-reset');

		await flushTick();
		expect(mocks.setCacheHashFields).not.toHaveBeenCalled();
		expect(mocks.deleteCacheValue).toHaveBeenCalledWith(countingStateKey('wb-reset'));
	});
});

describe('countingState load', () => {
	it('메모리에 없으면 Redis 필드로 복구해요', async () => {
		mocks.getCacheHashFields.mockResolvedValue({ current: '5', lastUserId: 'u-9', best: '7' });
		expect(await loadCountingState('load-restore')).toEqual({ current: 5, lastUserId: 'u-9', best: 7 });
	});

	it('Redis도 비어 있으면 기본값으로 시작해요', async () => {
		expect(await loadCountingState('load-default')).toEqual({ current: 0, lastUserId: null, best: 0 });
	});
});
