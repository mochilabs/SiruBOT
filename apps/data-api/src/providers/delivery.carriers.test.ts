import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 택배사 검색 — `/택배 택배사` 자동완성 목록 API의 계약이에요.
 * 조회(resolveCarrierId)와 같은 별칭·우선순위 규칙을 공유하는지, 목록 실패가 그대로 전파되는지 잠가요.
 */

const CARRIERS = [
	{ id: 'kr.cjlogistics', name: 'CJ대한통운', tel: '1588-1255' },
	{ id: 'kr.hanjin', name: '한진택배', tel: '1588-0011' },
	{ id: 'kr.epost', name: '우체국택배', tel: '1588-1300' }
];

async function loadProvider() {
	vi.resetModules();
	return import('./delivery.ts');
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('searchDeliveryCarriers', () => {
	it('빈 검색어는 전체 택배사 목록의 앞부분을 돌려줘요', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json(CARRIERS))
		);
		const { searchDeliveryCarriers } = await loadProvider();

		const result = await searchDeliveryCarriers('', 2);

		expect(result.map((carrier) => carrier.id)).toEqual(['kr.cjlogistics', 'kr.hanjin']);
	});

	it('별칭(대한통운)으로 검색해도 조회와 같은 택배사 id로 해석돼요', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json(CARRIERS))
		);
		const { searchDeliveryCarriers } = await loadProvider();

		const result = await searchDeliveryCarriers('대한통운');

		expect(result[0]?.id).toBe('kr.cjlogistics');
	});

	it('일치하는 택배사가 없으면 전체 목록으로 폴백해요 — 자동완성이 빈 화면이 되지 않게', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json(CARRIERS))
		);
		const { searchDeliveryCarriers } = await loadProvider();

		const result = await searchDeliveryCarriers('존재하지않는택배사');

		expect(result.length).toBe(CARRIERS.length);
	});

	it('택배사 목록 조회 실패는 DeliveryError로 전파돼요', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('', { status: 503 }))
		);
		const { searchDeliveryCarriers } = await loadProvider();

		await expect(searchDeliveryCarriers('cj')).rejects.toMatchObject({ name: 'DeliveryError' });
	});
});
