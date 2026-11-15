import { describe, expect, it } from 'vitest';
import { pickMatch } from './match.js';
import { createDeezerProvider } from './providers/deezer.js';
import { createMusicBrainzProvider } from './providers/musicbrainz.js';
import { SerialRateLimiter } from './rateLimit.js';
import { resolveIsrc, searchTermsFor } from './resolve.js';
import type { IsrcCandidate } from './types.js';

const noWait = () => new SerialRateLimiter(0);

function fakeFetch(routes: Record<string, unknown | ((url: URL) => Response)>): typeof fetch {
	return (async (input: string | URL | Request) => {
		const url = new URL(input instanceof Request ? input.url : input);
		const route = Object.entries(routes).find(([prefix]) => url.href.startsWith(prefix));
		if (!route) return new Response('not found', { status: 404 });
		const value = route[1];
		if (typeof value === 'function') return (value as (url: URL) => Response)(url);
		return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
	}) as typeof fetch;
}

const deezerLemon = {
	data: [
		{ id: 1, title: 'Lemon', isrc: 'JPU901800227', duration: 256, artist: { name: 'Kenshi Yonezu' } },
		{ id: 2, title: 'Paper Flower', isrc: 'JPU901800569', duration: 275, artist: { name: 'Kenshi Yonezu' } }
	]
};
const mbLemon = {
	recordings: [
		{ id: 'a', title: 'Lemon', length: null, 'artist-credit': [{ name: '米津玄師' }] },
		{ id: 'b', title: 'Lemon', length: 255826, isrcs: ['JPU901800227'], 'artist-credit': [{ name: '米津玄師' }] }
	]
};

const candidate = (over: Partial<IsrcCandidate>): IsrcCandidate => ({
	isrc: 'JPU901800227',
	title: 'Lemon',
	artist: 'Kenshi Yonezu',
	durationMs: 256_000,
	provider: 'test',
	externalId: '1',
	...over
});

describe('pickMatch', () => {
	const terms = { artist: 'kenshi yonezu', title: 'lemon', durationMs: 255_000 };

	it('matches title, artist and length within three seconds', () => {
		expect(pickMatch(terms, [candidate({})])?.confidence).toBe('exact');
	});
	it('rejects a long MV cut', () => {
		expect(pickMatch(terms, [candidate({ durationMs: 275_000 })])).toBeNull();
	});
	it('rejects a different version', () => {
		expect(pickMatch(terms, [candidate({ title: 'Lemon (Remix)' })])).toBeNull();
	});
	it('rejects an unrelated artist', () => {
		expect(pickMatch(terms, [candidate({ artist: 'Karaoke Band' })])).toBeNull();
	});
	it('accepts a field-searched artist with another spelling as strong', () => {
		const match = pickMatch({ ...terms, artist: '米津玄師' }, [candidate({ artistFieldMatched: true })]);
		expect(match?.confidence).toBe('strong');
	});
	it('refuses strong matches when the ISRC is ambiguous', () => {
		const cands = [candidate({ artistFieldMatched: true }), candidate({ artistFieldMatched: true, isrc: 'JPU901800999' })];
		expect(pickMatch({ ...terms, artist: '米津玄師' }, cands)).toBeNull();
	});
});

describe('searchTermsFor', () => {
	it('splits YouTube titles and strips upload labels', () => {
		expect(searchTermsFor({ artist: 'Uploader', title: 'Kenshi Yonezu - Lemon (Official MV)', durationMs: 255_000, sourceName: 'youtube' })).toEqual({
			artist: 'kenshi yonezu',
			title: 'lemon',
			durationMs: 255_000
		});
	});
	it('needs a length', () => {
		expect(searchTermsFor({ artist: 'a', title: 'b', durationMs: 0 })).toBeNull();
	});
});

describe('resolveIsrc', () => {
	const providers = () => [createDeezerProvider({ limiter: noWait() }), createMusicBrainzProvider({ limiter: noWait() })];

	it('finds a Latin-script name on Deezer', async () => {
		const fetch = fakeFetch({ 'https://api.deezer.com/search': deezerLemon });
		const result = await resolveIsrc({ artist: 'Kenshi Yonezu - Topic', title: 'Lemon', durationMs: 255_500 }, { providers: providers(), fetch });
		expect(result.match).toMatchObject({ isrc: 'JPU901800227', provider: 'deezer', confidence: 'exact' });
	});

	it('falls back to MusicBrainz for a native-script name', async () => {
		const fetch = fakeFetch({ 'https://api.deezer.com/search': { data: [] }, 'https://musicbrainz.org/ws/2/recording': mbLemon });
		const result = await resolveIsrc({ artist: '米津玄師', title: 'Lemon', durationMs: 255_000 }, { providers: providers(), fetch });
		expect(result.match).toMatchObject({ isrc: 'JPU901800227', provider: 'musicbrainz' });
		expect(result.failedProviders).toEqual([]);
	});

	it('reports a Deezer quota error as a failed provider, not as "not found"', async () => {
		const fetch = fakeFetch({
			'https://api.deezer.com/search': { error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 } },
			'https://musicbrainz.org/ws/2/recording': { recordings: [] }
		});
		const result = await resolveIsrc({ artist: 'x', title: 'y', durationMs: 1000 }, { providers: providers(), fetch });
		expect(result).toEqual({ match: null, failedProviders: ['deezer'] });
	});

	it('treats HTTP errors and broken payloads as failures', async () => {
		const fetch = fakeFetch({
			'https://api.deezer.com/search': () => new Response('busy', { status: 503 }),
			'https://musicbrainz.org/ws/2/recording': { recordings: 'nope' }
		});
		const result = await resolveIsrc({ artist: 'x', title: 'y', durationMs: 1000 }, { providers: providers(), fetch });
		expect(result.failedProviders).toEqual(['deezer', 'musicbrainz']);
	});

	it('sends a User-Agent to MusicBrainz', async () => {
		let agent: string | null = null;
		const fetch = (async (_input: URL, init?: RequestInit) => {
			agent = new Headers(init?.headers).get('user-agent');
			return new Response(JSON.stringify({ recordings: [] }));
		}) as unknown as typeof globalThis.fetch;
		await createMusicBrainzProvider({ limiter: noWait(), userAgent: 'Test/1.0' }).search({ artist: 'a', title: 'b', durationMs: 1 }, { fetch });
		expect(agent).toBe('Test/1.0');
	});
});

describe('SerialRateLimiter', () => {
	it('spaces calls by the minimum interval', async () => {
		let clock = 0;
		const waits: number[] = [];
		const limiter = new SerialRateLimiter(
			100,
			() => clock,
			async (ms) => {
				waits.push(ms);
				clock += ms;
			}
		);
		await Promise.all([limiter.schedule(async () => 1), limiter.schedule(async () => 2), limiter.schedule(async () => 3)]);
		expect(waits).toEqual([100, 100]);
	});
});
