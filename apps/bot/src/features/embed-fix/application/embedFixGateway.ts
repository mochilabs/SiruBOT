import { embedFixMetadataResponseSchema, type EmbedFixMetadataRequest, type EmbedFixResult } from '@sirubot/utils';
import type { AppLogger } from '../../../lib/appLogger.ts';

const METADATA_TIMEOUT_MS = 10_000;

export interface EmbedFixGatewayDeps {
	logger: Pick<AppLogger, 'debug'>;
	baseUrl: () => string | null;
	authHeaders: () => Record<string, string>;
}

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
