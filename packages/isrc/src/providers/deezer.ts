import { z } from 'zod';
import { getJson } from '../http.js';
import { SerialRateLimiter } from '../rateLimit.js';
import { IsrcProviderError, type IsrcCandidate, type IsrcProvider, type IsrcSearchTerms, type ProviderContext } from '../types.js';

const NAME = 'deezer';
const BASE = 'https://api.deezer.com';
/** Deezer는 5초에 50회까지라 여유 있게 120ms 간격으로 직렬화해요. */
const MIN_INTERVAL_MS = 120;

// Deezer는 오류도 HTTP 200 + { error }로 돌려줘요 (code 4 = quota).
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

/**
 * Deezer 공개 검색 (키 없음). 검색 결과에 ISRC가 바로 들어 있어요.
 * 필드 검색(`artist:"…" track:"…"`)은 빈 결과를 자주 돌려줘서 자유 검색을 써요. 아티스트 일치는 match.ts가 따져요.
 * 라틴 표기에 강하고 원어 표기(`米津玄師`)는 약해요 — 그쪽은 MusicBrainz가 메워요.
 */
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
