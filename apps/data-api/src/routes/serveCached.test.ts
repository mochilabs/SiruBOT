import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataApiError, serveCached } from './serveCached.ts';
import { sharedCache } from '../utils/cache.ts';

describe('serveCached', () => {
	afterEach(async () => {
		// 모듈 레벨 메모리 폴백 맵을 비워 테스트 간 상태를 격리해요.
		await sharedCache.disconnect();
	});

	it('캐시 히트: 저장된 값을 역직렬화해 반환하고 fetchFresh를 부르지 않는다', async () => {
		const fetchFresh = vi.fn(async () => ({ cached: 'fresh' }));
		await sharedCache.set('hit-key', JSON.stringify({ cached: 'payload' }), 60);

		const result = await serveCached<{ cached: string }>({
			route: 'test-hit',
			key: 'hit-key',
			ttlSeconds: 60,
			provider: 'provider-hit',
			fetchFresh
		});

		expect(result).toEqual({ data: { cached: 'payload' }, cached: true });
		expect(fetchFresh).not.toHaveBeenCalled();
	});

	it('캐시 미스: upstream 결과를 저장하고 cached:false로 반환한다', async () => {
		const fetchFresh = vi.fn(async () => ({ value: 42 }));

		const result = await serveCached({
			route: 'test-miss',
			key: 'miss-key',
			ttlSeconds: 60,
			provider: 'provider-miss',
			fetchFresh
		});

		expect(result).toEqual({ data: { value: 42 }, cached: false });
		await expect(sharedCache.get('miss-key')).resolves.toBe(JSON.stringify({ value: 42 }));
	});

	it('손상된 캐시 JSON은 miss로 취급해 upstream에서 새로 가져온다', async () => {
		const fetchFresh = vi.fn(async () => ({ fresh: true }));
		await sharedCache.set('corrupt-key', '{not-json', 60);

		const result = await serveCached({
			route: 'test-corrupt',
			key: 'corrupt-key',
			ttlSeconds: 60,
			provider: 'provider-corrupt',
			fetchFresh
		});

		expect(result).toEqual({ data: { fresh: true }, cached: false });
		expect(fetchFresh).toHaveBeenCalledTimes(1);
	});

	it('동시 같은 키 요청은 upstream 호출 하나로 합쳐진다 (in-flight dedup)', async () => {
		let resolveFetch!: (value: { value: number }) => void;
		const fetchFresh = vi.fn(() => new Promise<{ value: number }>((resolve) => (resolveFetch = resolve)));

		const options = {
			route: 'test-dedup',
			key: 'dedup-key',
			ttlSeconds: 60,
			provider: 'provider-dedup',
			fetchFresh
		};
		const first = serveCached(options);
		const second = serveCached(options);
		// 두 호출이 모두 dedup 진입(캐시 조회 → in-flight 등록)까지 도달하게 해요.
		await new Promise((resolve) => setTimeout(resolve, 0));
		resolveFetch({ value: 7 });
		const [a, b] = await Promise.all([first, second]);

		expect(fetchFresh).toHaveBeenCalledTimes(1);
		expect(a).toEqual({ data: { value: 7 }, cached: false });
		expect(b).toEqual(a);
	});

	it('도메인 에러는 그대로 전파되고 회로를 오염시키지 않는다', async () => {
		const domainError = Object.assign(new Error('사용자 입력 문제'), { name: 'WeatherError' });

		await expect(
			serveCached({
				route: 'test-domain',
				key: 'domain-key',
				ttlSeconds: 60,
				provider: 'provider-domain',
				fetchFresh: async () => {
					throw domainError;
				}
			})
		).rejects.toMatchObject({ name: 'WeatherError' });

		// 회로가 닫혀 있어야 이후 호출이 성공해요
		const ok = await serveCached({
			route: 'test-domain',
			key: 'domain-key',
			ttlSeconds: 60,
			provider: 'provider-domain',
			fetchFresh: async () => ({ value: 1 })
		});
		expect(ok).toEqual({ data: { value: 1 }, cached: false });
	});

	it('DataApiError는 상태코드를 유지한 채 그대로 전파된다', async () => {
		await expect(
			serveCached({
				route: 'test-dataapi',
				key: 'dataapi-key',
				ttlSeconds: 60,
				provider: 'provider-dataapi',
				fetchFresh: async () => {
					throw new DataApiError(400, 'bad_input', '잘못된 요청');
				}
			})
		).rejects.toMatchObject({ status: 400, code: 'bad_input' });
	});

	it('응답 검증 실패는 upstream 실패로 분류된다', async () => {
		await expect(
			serveCached({
				route: 'test-validate',
				key: 'validate-key',
				ttlSeconds: 60,
				provider: 'provider-validate',
				fetchFresh: async () => ({ bad: true }),
				validate: (data) => (data as { bad: boolean }).bad !== true
			})
		).rejects.toMatchObject({ status: 502, code: 'upstream_failed' });
	});

	it('연속 실패로 회로가 열리면 503을 던지고 upstream을 부르지 않는다', async () => {
		const fetchFresh = vi.fn(async () => {
			throw new Error('down');
		});
		const base = {
			route: 'test-breaker',
			ttlSeconds: 60,
			provider: 'provider-breaker',
			fetchFresh
		};

		// failureThreshold(5)만큼 실패하면 회로가 열려요
		for (let i = 0; i < 5; i++) {
			await expect(serveCached({ ...base, key: `breaker-key-${i}` })).rejects.toMatchObject({
				status: 502,
				code: 'upstream_failed'
			});
		}

		// 회로 open — upstream 없이 즉시 503
		await expect(serveCached({ ...base, key: 'breaker-key-blocked' })).rejects.toMatchObject({
			status: 503,
			code: 'provider_circuit_open'
		});
		expect(fetchFresh).toHaveBeenCalledTimes(5);
	});
});
