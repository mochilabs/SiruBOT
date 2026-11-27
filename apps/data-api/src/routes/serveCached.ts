import { breaker } from '../utils/breaker.ts';
import { sharedCache } from '../utils/cache.ts';
import { deduped } from '../utils/dedup.ts';
import { metrics } from '../utils/metrics.ts';
import { ProxyUnavailableError } from '../utils/proxyPool.ts';

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

export async function serveCached<T>(options: {
	route: string;
	key: string;
	ttlSeconds: number | ((data: T) => number);
	provider: string;
	fetchFresh: () => Promise<T>;
	validate?: (data: T) => boolean;
	negativeTtlSeconds?: number;
}): Promise<{ data: T; cached: boolean }> {
	const { route, key, ttlSeconds, provider, fetchFresh, validate, negativeTtlSeconds } = options;
	const missKey = `${key}:miss`;
	metrics.request(route);

	const cached = await sharedCache.get(key);
	if (cached) {
		try {
			metrics.hit(route);
			return { data: JSON.parse(cached) as T, cached: true };
		} catch {}
	}
	if (negativeTtlSeconds) {
		const miss = await sharedCache.get(missKey);
		if (miss) {
			try {
				const { code, message } = JSON.parse(miss) as { code: string; message: string };
				metrics.hit(route);
				throw new DataApiError(404, code, message);
			} catch (error) {
				if (error instanceof DataApiError) throw error;
			}
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
			await sharedCache.set(key, JSON.stringify(fresh), typeof ttlSeconds === 'number' ? ttlSeconds : ttlSeconds(fresh));
			breaker.recordSuccess(provider);
			metrics.upstream(route, Date.now() - start, true);
			return fresh;
		} catch (error) {
			metrics.upstream(route, Date.now() - start, false);
			if (error instanceof DataApiError && error.status === 404 && negativeTtlSeconds) {
				breaker.recordSuccess(provider);
				await sharedCache.set(missKey, JSON.stringify({ code: error.code, message: error.message }), negativeTtlSeconds);
				throw error;
			}
			if (error instanceof ProxyUnavailableError) {
				throw new DataApiError(503, 'upstream_blocked', '외부 API가 일시적으로 요청을 막고 있어요. 잠시 후 다시 시도해 주세요.');
			}
			if (error instanceof DataApiError) throw error;
			if (error instanceof Error && error.name !== 'Error' && error.name !== 'TypeError' && error.name !== 'AbortError') throw error;
			breaker.recordFailure(provider);
			// Omit upstream error details from response; fetch errors can contain request URLs.
			throw new DataApiError(502, 'upstream_failed', '외부 API 호출에 실패했어요. 잠시 후 다시 시도해 주세요.');
		}
	});
	return { data, cached: false };
}
