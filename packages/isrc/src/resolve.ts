import { trackIdentity } from '@sirubot/utils/trackIdentity';
import { pickMatch } from './match.js';
import { IsrcProviderError, type IsrcProvider, type IsrcQuery, type IsrcResolution, type IsrcSearchTerms } from './types.js';

export interface ResolveOptions {
	providers: IsrcProvider[];
	fetch?: typeof fetch;
	signal?: AbortSignal;
}

export function searchTermsFor(query: IsrcQuery): IsrcSearchTerms | null {
	const identity = trackIdentity({ title: query.title, author: query.artist, durationMs: query.durationMs, sourceName: query.sourceName });
	if (!identity.artist || !identity.title || identity.durationMs <= 0) return null;
	return { artist: identity.artist, title: identity.title, durationMs: identity.durationMs };
}

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
