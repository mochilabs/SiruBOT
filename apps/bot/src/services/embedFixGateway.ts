/**
 * 임베드 복구 메타데이터 게이트웨이 — data-api의 /v1/embed-fix/metadata를 호출해요.
 *
 * - X(fxtwitter API)·인스타그램(kkinstagram)·BOOTH(OG) 조회를 data-api가 대행해요.
 *   외부 프로바이더 캐시·서킷브레이커가 data-api에 있어서 샤드들이 결과를 공유해요.
 * - DATA_API_URL 미설정·실패·응답 검증 실패면 null — 호출자는 레거시 경로(도메인 스왑)로 폴백해요.
 */
import { container } from '@sapphire/framework';
import { embedFixMetadataResponseSchema, type EmbedFixMetadataRequest, type EmbedFixResult } from '@sirubot/utils';
import { dataApiAuthHeaders, gatewayBaseUrl } from '../lib/dataApi.ts';

const METADATA_TIMEOUT_MS = 10_000;

/** 링크들의 임베드 메타데이터를 물어봐요 — 실패는 null (레거시 폴백) */
export async function fetchEmbedFixMetadata(request: EmbedFixMetadataRequest): Promise<EmbedFixResult[] | null> {
	const base = gatewayBaseUrl();
	if (!base) return null;

	try {
		const response = await fetch(`${base}/v1/embed-fix/metadata`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...dataApiAuthHeaders() },
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(METADATA_TIMEOUT_MS)
		});
		if (!response.ok) return null;

		const payload = embedFixMetadataResponseSchema.safeParse(await response.json().catch(() => null));
		if (!payload.success) {
			container.logger.debug('[embedFixGateway] response schema mismatch');
			return null;
		}
		return payload.data.results;
	} catch (error) {
		container.logger.debug(`[embedFixGateway] request failed: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}
