import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureOutboundPool } from '../utils/proxyPool.ts';
import { youtubeClientFor } from './youtubeClient.ts';
import { fetchYouTubeChaptersFresh } from './chapters.ts';

vi.mock('./youtubeClient.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('./youtubeClient.ts')>()),
	youtubeClientFor: vi.fn()
}));

const chapterInfo = {
	playability_status: { status: 'OK', reason: '' },
	player_overlays: {
		decorated_player_bar: {
			player_bar: {
				markers_map: [
					{
						marker_key: 'DESCRIPTION_CHAPTERS',
						value: {
							chapters: [
								{ title: { toString: () => 'Intro' }, time_range_start_millis: 0 },
								{ title: { toString: () => 'Verse' }, time_range_start_millis: 60_000 }
							]
						}
					}
				]
			}
		}
	}
};
const botCheckInfo = { playability_status: { status: 'LOGIN_REQUIRED', reason: "Sign in to confirm you're not a bot" } };

afterEach(() => {
	vi.mocked(youtubeClientFor).mockReset();
	configureOutboundPool('direct');
});

describe('fetchYouTubeChaptersFresh', () => {
	it('moves to the next route when direct gets a bot check, and cools direct down for chapters', async () => {
		const pool = configureOutboundPool('direct,http://10.0.0.28:3128');
		vi.mocked(youtubeClientFor).mockImplementation(
			async (route) => ({ getInfo: vi.fn().mockResolvedValue(route.direct ? botCheckInfo : chapterInfo) }) as never
		);
		const chapters = await fetchYouTubeChaptersFresh('dQw4w9WgXcQ', 120_000);
		expect(chapters.map((c) => c.name)).toEqual(['Intro', 'Verse']);
		const [direct, proxy] = pool.snapshot();
		expect(Object.keys(direct!.cooling)).toEqual(['chapters']);
		expect(proxy!.counts.ok).toBe(1);
	});

	it('keeps age-gated videos (other LOGIN_REQUIRED) as an ordinary failure on the same route', async () => {
		const pool = configureOutboundPool('direct,http://10.0.0.28:3128');
		vi.mocked(youtubeClientFor).mockResolvedValue({
			getInfo: vi.fn().mockResolvedValue({ playability_status: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm your age' } })
		} as never);
		await expect(fetchYouTubeChaptersFresh('dQw4w9WgXcQ', 120_000)).resolves.toEqual([]);
		expect(pool.snapshot()[0]!.cooling).toEqual({});
	});
});
