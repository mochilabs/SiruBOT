/**
 * 임베드 복구 메타데이터 게이트웨이 — data-api의 /v1/embed-fix/metadata를 호출해요.
 *
 * - X(fxtwitter API)·인스타그램(kkinstagram)·BOOTH(OG) 조회를 data-api가 대행해요.
 *   외부 프로바이더 캐시·서킷브레이커가 data-api에 있어서 샤드들이 결과를 공유해요.
 * - DATA_API_URL 미설정·실패·응답 검증 실패면 null — 호출자는 레거시 경로(도메인 스왑)로 폴백해요.
 */
import { embedFixMetadataResponseSchema, type EmbedFixMetadataRequest, type EmbedFixResult } from '@sirubot/utils';
import type { AppLogger } from '../../../lib/appLogger.ts';

const METADATA_TIMEOUT_MS = 10_000;

/** 게이트웨이 호출에 필요한 값 — 설정 읽기(getConfig)는 호출 측(discord 리스너)이 해서 여기로 넘겨요 */
export interface EmbedFixGatewayDeps {
	logger: Pick<AppLogger, 'debug'>;
	/** data-api base URL — 설정되지 않았으면 null (호출 차단) */
	baseUrl: () => string | null;
	/** data-api 인증 헤더 — 키가 없으면 빈 맵 */
	authHeaders: () => Record<string, string>;
}

/** 링크들의 임베드 메타데이터를 물어봐요 — 실패는 null (레거시 폴백) */
export async function fetchEmbedFixMetadata(deps: EmbedFixGatewayDeps, request: EmbedFixMetadataRequest): Promise<EmbedFixResult[] | null> {
	const base = deps.baseUrl();
	if (!base) return null;

	try {
		const response = await fetch(`${base}/v1/embed-fix/metadata`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...deps.authHeaders() },
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(METADATA_TIMEOUT_MS)
		});
		if (!response.ok) return null;

		const payload = embedFixMetadataResponseSchema.safeParse(await response.json().catch(() => null));
		if (!payload.success) {
			deps.logger.debug('[embedFixGateway] response schema mismatch');
			return null;
		}
		return payload.data.results;
	} catch (error) {
		deps.logger.debug(`[embedFixGateway] request failed: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}
