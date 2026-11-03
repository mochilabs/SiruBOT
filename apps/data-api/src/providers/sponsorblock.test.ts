import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSponsorBlockSegmentsFresh } from './sponsorblock.ts';

afterEach(() => vi.unstubAllGlobals());

describe('SponsorBlock API response', () => {
	it('converts seconds to milliseconds and retains only skip actions', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify([
					{ category: 'intro', actionType: 'skip', segment: [0, 12.345] },
					{ category: 'sponsor', actionType: 'skip', segment: [30, 40] }
				])
			)
		);
		vi.stubGlobal('fetch', fetchMock);
		await expect(fetchSponsorBlockSegmentsFresh('dQw4w9WgXcQ')).resolves.toEqual([
			{ category: 'intro', startMs: 0, endMs: 12345 },
			{ category: 'sponsor', startMs: 30000, endMs: 40000 }
		]);
		const url = new URL(fetchMock.mock.calls[0][0]);
		expect(url.searchParams.get('videoID')).toBe('dQw4w9WgXcQ');
		expect(url.searchParams.get('actionType')).toBe('skip');
	});

	it('treats 404 as a valid empty result', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
		await expect(fetchSponsorBlockSegmentsFresh('dQw4w9WgXcQ')).resolves.toEqual([]);
	});

	it('rejects unexpected actions instead of caching a partial response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response(JSON.stringify([{ category: 'intro', actionType: 'mute', segment: [0, 10] }])))
		);
		await expect(fetchSponsorBlockSegmentsFresh('dQw4w9WgXcQ')).rejects.toThrow('invalid segments');
	});
});
