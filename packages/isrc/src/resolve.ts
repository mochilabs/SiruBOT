import { trackIdentity } from '@sirubot/utils/trackIdentity';
import { pickMatch } from './match.js';
import { IsrcProviderError, type IsrcProvider, type IsrcQuery, type IsrcResolution, type IsrcSearchTerms } from './types.js';

export interface ResolveOptions {
	providers: IsrcProvider[];
	fetch?: typeof fetch;
	signal?: AbortSignal;
}

/** 쿼리를 차트와 같은 규칙으로 정규화한 검색어. 아티스트·제목·길이 중 하나라도 없으면 null. */
export function searchTermsFor(query: IsrcQuery): IsrcSearchTerms | null {
	const identity = trackIdentity({ title: query.title, author: query.artist, durationMs: query.durationMs, sourceName: query.sourceName });
	if (!identity.artist || !identity.title || identity.durationMs <= 0) return null;
	return { artist: identity.artist, title: identity.title, durationMs: identity.durationMs };
}

/** 프로바이더를 순서대로 시도하고 처음 확신할 수 있는 일치에서 멈춰요. */
export async function resolveIsrc(query: IsrcQuery, options: ResolveOptions): Promise<IsrcResolution> {
	const terms = searchTermsFor(query);
	if (!terms) return { match: null, failedProviders: [] };
	const ctx = { fetch: options.fetch ?? globalThis.fetch, signal: options.signal };
	const failedProviders: string[] = [];
	for (const provider of options.providers) {
		options.signal?.throwIfAborted();
		try {
			const match = pickMatch(terms, await provider.search(terms, ctx));
			if (match) return { match, failedProviders };
		} catch (error) {
			if (!(error instanceof IsrcProviderError)) throw error;
			failedProviders.push(provider.name);
		}
	}
	return { match: null, failedProviders };
}
