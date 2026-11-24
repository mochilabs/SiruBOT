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

/**
 * 표준 읽기 경로: 캐시 → in-flight 합치기 → 서킷브레이커 → upstream → 검증 → 캐시 저장.
 * upstream 장애 시 throw (stale이 필요하면 호출자가 이전 키로 폴백해요).
 * `negativeTtlSeconds`를 주면 upstream이 404(DataApiError)를 던진 결과도 그만큼 기억해 같은 404를 바로 돌려줘요.
 */
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
		} catch {
			// 손상된 캐시는 miss로 취급
		}
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
				// 손상된 기록은 무시해요
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
				// 결과 없음은 업스트림이 정상 응답한 거예요 — 회로엔 성공으로 남기고 잠깐 기억해요
				breaker.recordSuccess(provider);
				await sharedCache.set(missKey, JSON.stringify({ code: error.code, message: error.message }), negativeTtlSeconds);
				throw error;
			}
			// 나갈 경로가 모두 막힌 건 경로 묶음이 이미 쉬게 했어요 — 회로엔 남기지 않아요
			if (error instanceof ProxyUnavailableError) {
				throw new DataApiError(503, 'upstream_blocked', '외부 API가 일시적으로 요청을 막고 있어요. 잠시 후 다시 시도해 주세요.');
			}
			// 도메인 에러(WeatherError/DeliveryError·zod 등 사용자-입력/검증 오류)는 프로바이더 장애가 아니므로
			// 회로를 오염시키지 않아요 — 라우트가 상태코드를 매핑하도록 그대로 전파해요.
			if (error instanceof DataApiError) throw error;
			if (error instanceof Error && error.name !== 'Error' && error.name !== 'TypeError' && error.name !== 'AbortError') throw error;
			// 여기까지 도달한 건 진짜 업스트림 장애(fetch 실패·응답 검증 실패)뿐이에요 — 이것만 회로에 기록해요.
			breaker.recordFailure(provider);
			// 응답 본문에는 원인을 싣지 않아요 — fetch 실패 메시지에는 요청 URL(사용자 입력 포함)이 들어가요
			throw new DataApiError(502, 'upstream_failed', '외부 API 호출에 실패했어요. 잠시 후 다시 시도해 주세요.');
		}
	});
	return { data, cached: false };
}
