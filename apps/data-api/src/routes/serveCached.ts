import { breaker } from '../utils/breaker.ts';
import { sharedCache } from '../utils/cache.ts';
import { deduped } from '../utils/dedup.ts';
import { metrics } from '../utils/metrics.ts';

export class DataApiError extends Error {
	public constructor(
		public readonly status: number,
		public readonly code: string,
		message: string
	) {
		super(message);
		this.name = 'DataApiError';
	}
}

/**
 * 표준 읽기 경로: 캐시 → in-flight 합치기 → 서킷브레이커 → upstream → 검증 → 캐시 저장.
 * upstream 장애 시 throw (stale이 필요하면 호출자가 이전 키로 폴백해요).
 */
export async function serveCached<T>(options: {
	route: string;
	key: string;
	ttlSeconds: number;
	provider: string;
	fetchFresh: () => Promise<T>;
	validate?: (data: T) => boolean;
}): Promise<{ data: T; cached: boolean }> {
	const { route, key, ttlSeconds, provider, fetchFresh, validate } = options;
	metrics.request(route);

	const cached = await sharedCache.get(key);
	if (cached) {
		try {
			metrics.hit(route);
			return { data: JSON.parse(cached) as T, cached: true };
		} catch {
			// 손상된 캐시는 miss로 취급
		}
	}

	const data = await deduped(key, async () => {
		if (!breaker.canAttempt(provider)) {
			throw new DataApiError(503, 'provider_circuit_open', '외부 API가 일시적으로 차단됐어요. 잠시 후 다시 시도해 주세요.');
		}
		const start = Date.now();
		try {
			const fresh = await fetchFresh();
			if (validate && !validate(fresh)) throw new Error('response validation failed');
			await sharedCache.set(key, JSON.stringify(fresh), ttlSeconds);
			breaker.recordSuccess(provider);
			metrics.upstream(route, Date.now() - start, true);
			return fresh;
		} catch (error) {
			breaker.recordFailure(provider);
			metrics.upstream(route, Date.now() - start, false);
			// 도메인 에러(WeatherError/DeliveryError)는 라우트가 상태코드를 매핑하도록 그대로 전파해요.
			if (error instanceof DataApiError) throw error;
			if (error instanceof Error && error.name !== 'Error' && error.name !== 'TypeError' && error.name !== 'AbortError') throw error;
			throw new DataApiError(502, 'upstream_failed', error instanceof Error ? error.message : '외부 API 호출에 실패했어요.');
		}
	});
	return { data, cached: false };
}
