import { z } from 'zod';
import { getJson } from '../http.js';
import { SerialRateLimiter } from '../rateLimit.js';
import { IsrcProviderError, type IsrcCandidate, type IsrcProvider, type IsrcSearchTerms, type ProviderContext } from '../types.js';

const NAME = 'deezer';
const BASE = 'https://api.deezer.com';
// Deezer allows 50 requests per 5s.
const MIN_INTERVAL_MS = 120;

// Deezer returns errors as HTTP 200 + { error } (code 4 = quota).
const searchSchema = z.object({
	data: z
		.array(
			z.object({
				id: z.number(),
				title: z.string(),
				isrc: z.string().optional(),
				duration: z.number(),
				artist: z.object({ name: z.string() }),
				album: z.object({ cover_xl: z.string().nullable().optional(), cover_medium: z.string().nullable().optional() }).optional()
			})
		)
		.max(100)
		.optional(),
	error: z.object({ type: z.string().optional(), message: z.string().optional(), code: z.number().optional() }).optional()
});

export interface DeezerProviderOptions {
	limiter?: SerialRateLimiter;
}

/** Free-text search: field search (`artist:"…"`) often comes back empty. Strong on Latin names, weak on native scripts (MusicBrainz covers those). */
export function createDeezerProvider(options: DeezerProviderOptions = {}): IsrcProvider {
	const limiter = options.limiter ?? new SerialRateLimiter(MIN_INTERVAL_MS);

	return {
		name: NAME,
		async search(terms: IsrcSearchTerms, ctx: ProviderContext): Promise<IsrcCandidate[]> {
			const url = new URL(`${BASE}/search`);
			url.searchParams.set('q', `${terms.artist} ${terms.title}`);
			url.searchParams.set('limit', '10');
			const body = await limiter.schedule(() => getJson(NAME, url, searchSchema, ctx));
			if (body.error)
				throw new IsrcProviderError(NAME, `API error ${body.error.code ?? '?'}: ${body.error.message ?? body.error.type ?? 'unknown'}`);
			return (body.data ?? []).flatMap((hit) =>
				hit.isrc
					? [
							{
								isrc: hit.isrc,
								title: hit.title,
								artist: hit.artist.name,
								durationMs: hit.duration * 1000,
								provider: NAME,
								externalId: String(hit.id),
								artworkUrl: hit.album?.cover_xl ?? hit.album?.cover_medium ?? undefined
							}
						]
					: []
			);
		}
	};
}
