import { z } from 'zod';
import { getJson } from '../http.js';
import { SerialRateLimiter } from '../rateLimit.js';
import type { IsrcCandidate, IsrcProvider, IsrcSearchTerms, ProviderContext } from '../types.js';

const NAME = 'musicbrainz';
const BASE = 'https://musicbrainz.org/ws/2';
/** MusicBrainz는 초당 1회 제한이라 1.1초 간격으로 직렬화해요. */
const MIN_INTERVAL_MS = 1_100;
export const DEFAULT_MUSICBRAINZ_USER_AGENT = 'SiruBOT/0.1 ( https://github.com/mochilabs/SiruBOT )';

const searchSchema = z.object({
	recordings: z
		.array(
			z.object({
				id: z.string(),
				title: z.string(),
				length: z.number().nullable().optional(),
				isrcs: z.array(z.string()).max(50).optional(),
				'artist-credit': z
					.array(z.object({ name: z.string(), artist: z.object({ name: z.string() }).optional() }))
					.max(50)
					.optional()
			})
		)
		.max(100)
		.default([])
});

/** Lucene 구문 — 따옴표 안에서는 `\`와 `"`만 이스케이프하면 돼요. */
function phrase(value: string): string {
	return `"${value.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

export interface MusicBrainzProviderOptions {
	/** 서비스 식별용. 개인 연락처를 넣지 마세요. */
	userAgent?: string;
	limiter?: SerialRateLimiter;
}

export function createMusicBrainzProvider(options: MusicBrainzProviderOptions = {}): IsrcProvider {
	const limiter = options.limiter ?? new SerialRateLimiter(MIN_INTERVAL_MS);
	const userAgent = options.userAgent ?? DEFAULT_MUSICBRAINZ_USER_AGENT;

	return {
		name: NAME,
		async search(terms: IsrcSearchTerms, ctx: ProviderContext): Promise<IsrcCandidate[]> {
			const url = new URL(`${BASE}/recording`);
			url.searchParams.set('query', `recording:${phrase(terms.title)} AND artist:${phrase(terms.artist)}`);
			url.searchParams.set('fmt', 'json');
			url.searchParams.set('limit', '10');
			const body = await limiter.schedule(() => getJson(NAME, url, searchSchema, ctx, { 'user-agent': userAgent }));
			return body.recordings.flatMap((recording) => {
				const isrc = recording.isrcs?.[0];
				const credits = recording['artist-credit'] ?? [];
				if (!isrc || !recording.length || credits.length === 0) return [];
				const names = credits.flatMap((credit) =>
					credit.artist && credit.artist.name !== credit.name ? [credit.name, credit.artist.name] : [credit.name]
				);
				return [
					{
						isrc,
						title: recording.title,
						artist: credits.map((credit) => credit.name).join(' '),
						contributors: names,
						durationMs: recording.length,
						provider: NAME,
						externalId: recording.id,
						// 쿼리에 artist 필드를 걸었으니 별칭으로 찾은 결과도 아티스트 근거가 돼요.
						artistFieldMatched: true
					}
				];
			});
		}
	};
}
