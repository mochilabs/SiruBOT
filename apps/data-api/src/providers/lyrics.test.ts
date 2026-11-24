import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanLyricsTerms, lyricsTrackCacheKey, fetchLyrics, fetchLyricsForTrack, LyricsNotFoundError, parseLyricsfileWords } from './lyrics.ts';
import { fetchCaptionLyrics } from './youtubeCaptions.ts';

vi.mock('./youtubeCaptions.ts', () => ({ fetchCaptionLyrics: vi.fn() }));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.mocked(fetchCaptionLyrics).mockReset();
});

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status });
}

const LYRICSFILE = `version: '1.0'
lines:
- text: 우-우
  start_ms: 2290
  end_ms: 6580
  words:
  - text: 우-
    start_ms: 2290
  - text: 우
    start_ms: 2698
- text: 간주
  start_ms: 7000
`;

describe('cleanLyricsTerms', () => {
	it('strips Hangul and fullwidth bracket labels like 【공식】', () => {
		expect(cleanLyricsTerms({ title: '【공식】 Ditto (뮤직비디오)', artist: 'NewJeans', sourceName: 'youtube' }).track).toBe('Ditto');
	});

	it('strips MV label, quotes and artist prefix from a YouTube title', () => {
		expect(cleanLyricsTerms({ title: "IVE (아이브) 'LOVE DIVE' MV", artist: 'IVE', sourceName: 'youtube' })).toEqual({
			track: 'LOVE DIVE',
			artist: 'IVE'
		});
	});

	it('splits "artist - title" and removes bracketed upload labels', () => {
		expect(cleanLyricsTerms({ title: 'NewJeans - Ditto (Official Music Video)', artist: 'HYBE LABELS', sourceName: 'youtube' })).toEqual({
			track: 'Ditto',
			artist: 'NewJeans'
		});
		expect(cleanLyricsTerms({ title: '밤편지 [가사/Lyrics]', artist: '아이유', sourceName: 'youtube' }).track).toBe('밤편지');
	});

	it('keeps version markers and unrelated parentheses', () => {
		expect(cleanLyricsTerms({ title: 'Song (Inst.)', artist: 'X Artist', sourceName: 'spotify' }).track).toBe('Song (Inst.)');
		expect(cleanLyricsTerms({ title: 'Hype Boy (feat. Someone)', artist: 'NewJeans', sourceName: 'spotify' }).track).toBe(
			'Hype Boy (feat. Someone)'
		);
	});

	it('does not eat the whole title when it equals the artist', () => {
		expect(cleanLyricsTerms({ title: 'IVE', artist: 'IVE', sourceName: 'spotify' }).track).toBe('IVE');
	});
});

describe('parseLyricsfileWords', () => {
	it('extracts per-line words with start_ms', () => {
		const lines = parseLyricsfileWords(LYRICSFILE)!;
		expect(lines).toHaveLength(2);
		expect(lines[0]).toEqual({
			startMs: 2290,
			text: '우-우',
			endMs: 6580,
			words: [
				{ startMs: 2290, text: '우-' },
				{ startMs: 2698, text: '우' }
			]
		});
		expect(lines[1]!.words).toBeUndefined();
	});

	it('returns null when there are no words, the YAML is broken or missing', () => {
		expect(parseLyricsfileWords('lines:\n- text: a\n  start_ms: 1\n')).toBeNull();
		expect(parseLyricsfileWords('{{{ nope')).toBeNull();
		expect(parseLyricsfileWords(null)).toBeNull();
	});
});

describe('fetchLyricsForTrack', () => {
	const query = { title: 'Ditto', artist: 'NewJeans', durationMs: 186_000, sourceName: 'spotify' };
	const synced = { trackName: 'Ditto', artistName: 'NewJeans', duration: 186, instrumental: false, plainLyrics: 'p', syncedLyrics: '[00:01.00] a' };

	it('uses /api/get first and passes title, artist and rounded duration', async () => {
		const fetchMock = vi.fn().mockResolvedValue(json({ ...synced, hasWordSync: true, lyricsfile: LYRICSFILE }));
		vi.stubGlobal('fetch', fetchMock);
		const result = await fetchLyricsForTrack(query);
		const url = new URL(fetchMock.mock.calls[0]![0]);
		expect(url.pathname).toBe('/api/get');
		expect(url.searchParams.get('track_name')).toBe('Ditto');
		expect(url.searchParams.get('artist_name')).toBe('NewJeans');
		expect(url.searchParams.get('duration')).toBe('186');
		expect(result.matchKind).toBe('get');
		expect(result.hasWordSync).toBe(true);
		expect(result.wordSync?.[0]?.words).toHaveLength(2);
	});

	it('falls back to field search and applies the same-track rules', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(json({ code: 404 }, 404))
			.mockResolvedValueOnce(
				json([
					{ ...synced, trackName: 'Ditto (Inst)', instrumental: true },
					{ ...synced, artistName: 'Cover Band' },
					{ ...synced, duration: 200 },
					{ ...synced, syncedLyrics: null },
					{ ...synced, id: 5, hasWordSync: true, lyricsfile: LYRICSFILE },
					{ ...synced, id: 6 }
				])
			);
		vi.stubGlobal('fetch', fetchMock);
		const result = await fetchLyricsForTrack(query);
		const url = new URL(fetchMock.mock.calls[1]![0]);
		expect(url.pathname).toBe('/api/search');
		expect(url.searchParams.get('track_name')).toBe('Ditto');
		expect(url.searchParams.get('artist_name')).toBe('NewJeans');
		expect(url.searchParams.has('q')).toBe(false);
		expect(result.matchKind).toBe('search');
		expect(result.hasWordSync).toBe(true);
	});

	it('falls back to the q search for a same-title result with a different artist spelling', async () => {
		const alt = { ...synced, artistName: '뉴진스', duration: 190 };
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(json({}, 404))
			.mockResolvedValueOnce(json([]))
			.mockResolvedValueOnce(json([alt]));
		vi.stubGlobal('fetch', fetchMock);
		const result = await fetchLyricsForTrack(query);
		expect(new URL(fetchMock.mock.calls[2]![0]).searchParams.get('q')).toBe('NewJeans Ditto');
		expect(result.matchKind).toBe('query');
		expect(result.artistName).toBe('뉴진스');
	});

	it('rejects a q search result that is a different song', async () => {
		const other = { ...synced, trackName: 'Other', artistName: 'Someone' };
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(json({}, 404))
				.mockResolvedValueOnce(json([]))
				.mockResolvedValueOnce(json([other]))
		);
		await expect(fetchLyricsForTrack(query)).rejects.toThrow('lyrics not found');
	});

	it('accepts a candidate whose length differs by up to 10 seconds', async () => {
		const near = { ...synced, duration: 194 };
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(json({}, 404))
				.mockResolvedValueOnce(json([near]))
		);
		const result = await fetchLyricsForTrack(query);
		expect(result.matchKind).toBe('search');
	});

	it('prefers a same-track plain lyric over the q fallback', async () => {
		const plain = { ...synced, syncedLyrics: null };
		vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(plain)).mockResolvedValueOnce(json([])));
		const result = await fetchLyricsForTrack(query);
		expect(result.matchKind).toBe('get');
		expect(result.syncedLyrics).toBeNull();
		expect(result.plainLyrics).toBe('p');
	});

	it('throws when nothing is found anywhere', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(async () => json([]))
		);
		await expect(fetchLyricsForTrack({ ...query, durationMs: 0 })).rejects.toBeInstanceOf(LyricsNotFoundError);
	});
});

describe('captions fallback', () => {
	const query = { title: 'Ditto', artist: 'NewJeans', durationMs: 186_000, sourceName: 'spotify' };
	const synced = { trackName: 'Ditto', artistName: 'NewJeans', duration: 186, instrumental: false, plainLyrics: 'p', syncedLyrics: '[00:01.00] a' };
	const plain = { ...synced, syncedLyrics: null };
	const withVideo = { ...query, videoId: 'dQw4w9WgXcQ' };

	it('uses uploader captions before a plain-only LRCLIB lyric', async () => {
		vi.mocked(fetchCaptionLyrics).mockResolvedValue({
			status: 'ok',
			captions: { lines: [{ startMs: 1000, text: 'line', endMs: null }], koreanByLine: { line: '줄' } }
		});
		vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(plain)).mockResolvedValueOnce(json([])));
		const result = await fetchLyricsForTrack(withVideo);
		expect(result).toMatchObject({ matchKind: 'captions', captionStatus: 'ok', captionTranslation: { line: '줄' } });
		expect(result.syncedLyrics).toBe('[00:01.00]line');
	});

	it('marks the stand-in result when captions were blocked, so it is cached briefly', async () => {
		vi.mocked(fetchCaptionLyrics).mockResolvedValue({ status: 'error' });
		vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(plain)).mockResolvedValueOnce(json([])));
		await expect(fetchLyricsForTrack(withVideo)).resolves.toMatchObject({ matchKind: 'get', captionStatus: 'error' });
	});

	it('keeps the normal status when the video has no captions', async () => {
		vi.mocked(fetchCaptionLyrics).mockResolvedValue({ status: 'none' });
		vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(plain)).mockResolvedValueOnce(json([])));
		await expect(fetchLyricsForTrack(withVideo)).resolves.toMatchObject({ matchKind: 'get', captionStatus: 'none' });
	});

	it('does not look up captions when LRCLIB already has synced lyrics', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(synced)));
		await expect(fetchLyricsForTrack(withVideo)).resolves.toMatchObject({ matchKind: 'get' });
		expect(fetchCaptionLyrics).not.toHaveBeenCalled();
	});

	it('adds the video id to the cache key only when present', () => {
		const q = { title: 'Ditto', artist: 'NewJeans', durationMs: 186_000 };
		expect(lyricsTrackCacheKey({ ...q, videoId: 'dQw4w9WgXcQ' })).toBe(`${lyricsTrackCacheKey(q)}|dQw4w9WgXcQ`);
	});
});

describe('fetchLyrics (q search, existing behavior)', () => {
	it('returns the first result with the legacy fields', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([{ trackName: 'A', artistName: 'B', plainLyrics: 'x', syncedLyrics: null }])));
		await expect(fetchLyrics('A (live)')).resolves.toMatchObject({
			trackName: 'A',
			artistName: 'B',
			plainLyrics: 'x',
			syncedLyrics: null,
			matchKind: 'query'
		});
	});
});
