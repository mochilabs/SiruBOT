import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliveryTrackCacheKey, trackDelivery } from './delivery.ts';

/**
 * delivery provider 스모크 — 별칭 해석(택배사 목록 조회 생략), 운송장번호 정규화,
 * 유저 대상 실패 메시지를 fetch 스텁으로 잠가요.
 */

const LEGACY_TRACK = {
	carrier: { id: 'kr.cjlogistics', name: 'CJ대한통운', tel: '1588-1255' },
	state: { id: 'delivered', text: '배송완료' },
	progresses: [{ time: '2026-10-23 10:00', status: { text: '배송완료' }, location: { name: '서울' }, description: '문앞' }]
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('trackDelivery', () => {
	it('별칭 힌트는 택배사 목록 없이 바로 조회하고 운송장번호 공백·대시를 없애요', async () => {
		const fetchMock = vi.fn(async (_input: URL | string) => Response.json(LEGACY_TRACK));
		vi.stubGlobal('fetch', fetchMock);

		const result = await trackDelivery('대한통운', '123-456 7890');

		expect(result.carrier.id).toBe('kr.cjlogistics');
		expect(result.stateText).toBe('배송완료');
		expect(result.progresses[0]).toMatchObject({ statusText: '배송완료', location: '서울', description: '문앞' });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/carriers/kr.cjlogistics/tracks/1234567890');
	});

	it('404 응답은 운송장 확인 안내 메시지로 실패해요', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('', { status: 404 }))
		);
		await expect(trackDelivery('cj', '1234567890')).rejects.toMatchObject({
			identifier: 'delivery_track_not_found',
			message: '택배사 또는 운송장번호를 찾을 수 없어요. 택배사 이름과 운송장번호를 다시 확인해 주세요.'
		});
	});
});

describe('deliveryTrackCacheKey', () => {
	it('carrier·운송장번호 순서로 키를 만들어요', () => {
		expect(deliveryTrackCacheKey('kr.cjlogistics', '1234567890')).toBe('dataapi:v1:delivery:track:kr.cjlogistics:1234567890');
	});
});
