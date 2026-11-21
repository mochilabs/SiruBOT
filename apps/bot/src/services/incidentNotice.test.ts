import { describe, expect, it, vi } from 'vitest';
import { INCIDENT_NOTICE_KEY } from '@sirubot/utils';
import { buildIncidentNotice } from '@sirubot/utils/incidentNotice';
import { wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { INCIDENT_NOTICE_CACHE_MS, createIncidentNoticeService } from './incidentNotice.ts';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const START = 1_700_000_000_000;
const KEY = 'secret';

function setup(raw: string | null) {
	let clock = START;
	const getCacheValue = vi.fn(async (key: string) => {
		expect(key).toBe(INCIDENT_NOTICE_KEY);
		return raw;
	});
	const service = createIncidentNoticeService({ getRedisStore: () => ({ getCacheValue }), signingKey: KEY, logger, now: () => clock });
	return { service, getCacheValue, advance: (ms: number) => (clock += ms) };
}

const stored = (minutes: number) => wrapRedisMessage(KEY, buildIncidentNotice({ message: '재생이 불안정해요', expiresInMinutes: minutes }, START));

describe('IncidentNoticeService', () => {
	it('공지가 있으면 문구 끝에 한 줄을 덧붙여요', async () => {
		const { service } = setup(stored(30));
		expect(await service.appendTo('오류예요.')).toBe('오류예요.\n-# 📢 공지: 재생이 불안정해요');
	});

	it('공지가 없으면 원문 그대로예요', async () => {
		const { service } = setup(null);
		expect(await service.appendTo('오류예요.')).toBe('오류예요.');
	});

	it('30초 동안은 캐시를 쓰고 그 뒤에 다시 읽어요', async () => {
		const { service, getCacheValue, advance } = setup(stored(30));
		await service.current();
		await service.current();
		expect(getCacheValue).toHaveBeenCalledTimes(1);
		advance(INCIDENT_NOTICE_CACHE_MS);
		await service.current();
		expect(getCacheValue).toHaveBeenCalledTimes(2);
	});

	it('캐시된 공지도 만료 시각이 지나면 쓰지 않아요', async () => {
		const { service, advance } = setup(stored(1));
		expect(await service.current()).not.toBeNull();
		advance(20_000);
		expect(await service.current()).not.toBeNull();
		advance(45_000);
		expect(await service.current()).toBeNull();
	});

	it('서명이 맞지 않는 값은 무시해요', async () => {
		const { service } = setup(wrapRedisMessage('other-key', buildIncidentNotice({ message: 'x', expiresInMinutes: 5 }, START)));
		expect(await service.current()).toBeNull();
	});

	it('형식이 깨진 값은 무시해요', async () => {
		const { service } = setup(wrapRedisMessage(KEY, { message: 5 }));
		expect(await service.current()).toBeNull();
	});
});
