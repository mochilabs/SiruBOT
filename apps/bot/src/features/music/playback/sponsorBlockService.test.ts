import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from 'lavalink-client';
import type { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { fetchSponsorBlockSegments } from '../../../services/dataApiClient.ts';
import { SponsorBlockService } from './sponsorBlockService.ts';

const guildMixerMock = vi.hoisted(() => ({ getMixerSettings: vi.fn().mockResolvedValue({ crossfadeEnabled: true, crossfadeMs: 5000 }) }));

const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
const guildService = { getGuild: vi.fn() };
const mixerService = { isOverlapActive: vi.fn().mockReturnValue(false) };
const makeService = () =>
	new SponsorBlockService({
		logger,
		guildService: guildService as never,
		getClient: () => ({ channels: { cache: new Map() } }) as never,
		getMixerService: () => mixerService as never
	});

vi.mock('../../../services/dataApiClient.ts', () => ({ fetchSponsorBlockSegments: vi.fn() }));
vi.mock('../../../services/guildSettings/mixer.ts', async (orig) => ({ ...(await orig()), ...guildMixerMock }));

function track(id: string = 'dQw4w9WgXcQ'): Track {
	return { encoded: `encoded-${id}`, info: { sourceName: 'youtube', identifier: id, duration: 60000, isSeekable: true, isStream: false } } as Track;
}

function player(current: Track): CustomPlayer {
	const result = {
		guildId: 'guild',
		playing: true,
		paused: false,
		position: 0,
		queue: { current, tracks: [track('abcdefghijk')], previous: [] },
		repeatMode: 'off',
		seek: vi.fn(async (ms: number) => {
			result.position = ms;
		})
	};
	return result as unknown as CustomPlayer;
}

beforeEach(() => {
	vi.mocked(fetchSponsorBlockSegments).mockReset();
	guildService.getGuild.mockResolvedValue({ sponsorBlockSegments: ['intro', 'sponsor', 'outro'] } as never);
});
afterEach(() => vi.useRealTimers());

describe('BOT SponsorBlock ownership', () => {
	it('sends the end of contiguous selected intro segments as incoming start', async () => {
		vi.mocked(fetchSponsorBlockSegments).mockResolvedValue([
			{ category: 'intro', startMs: 0, endMs: 12000 },
			{ category: 'sponsor', startMs: 12000, endMs: 16000 },
			{ category: 'sponsor', startMs: 30000, endMs: 35000 }
		]);
		const service = makeService();
		await expect(service.incomingStartPositionMs(player(track()), track())).resolves.toBe(16000);
	});

	it('does not seek across an outgoing crossfade boundary', async () => {
		vi.mocked(fetchSponsorBlockSegments).mockResolvedValue([{ category: 'outro', startMs: 54000, endMs: 59000 }]);
		const service = makeService();
		const current = track();
		const playing = player(current);
		Object.assign(playing, { position: 55000 });
		service.startTrack(playing, current);
		await vi.waitFor(() => expect(fetchSponsorBlockSegments).toHaveBeenCalled());
		await Promise.resolve();
		expect(playing.seek).not.toHaveBeenCalled();
		playing.queue.tracks.splice(0);
		service.tick(playing);
		await vi.waitFor(() => expect(playing.seek).toHaveBeenCalledWith(59000));
		service.stop(playing);
	});

	it('offers an outro start as mixer end only while there is enough fade time', async () => {
		vi.mocked(fetchSponsorBlockSegments).mockResolvedValue([{ category: 'outro', startMs: 54000, endMs: 60000 }]);
		const service = makeService();
		const current = track();
		const playing = player(current);
		Object.assign(playing, { position: 45000 });
		service.startTrack(playing, current);
		await vi.waitFor(() => expect(service.outgoingEndPositionMs(playing)).toBe(54000));
		Object.assign(playing, { position: 50000 });
		expect(service.outgoingEndPositionMs(playing)).toBeUndefined();
		service.stop(playing);
	});

	it('discards a lookup completed after the player changes tracks', async () => {
		const pending = Promise.withResolvers<Awaited<ReturnType<typeof fetchSponsorBlockSegments>>>();
		vi.mocked(fetchSponsorBlockSegments).mockReturnValue(pending.promise);
		const service = makeService();
		const current = track();
		const playing = player(current);
		service.startTrack(playing, current);
		service.startTrack(playing, null);
		pending.resolve([{ category: 'intro', startMs: 0, endMs: 10000 }]);
		await Promise.resolve();
		await Promise.resolve();
		expect(playing.seek).not.toHaveBeenCalled();
	});

	it('can be constructed before the mixer exists and reads it when queue changes are checked', async () => {
		let lateMixer: typeof mixerService | undefined;
		const lazy = new SponsorBlockService({
			logger,
			guildService: guildService as never,
			getClient: () => ({ channels: { cache: new Map() } }) as never,
			getMixerService: () => lateMixer as never
		});
		lateMixer = mixerService;
		vi.mocked(fetchSponsorBlockSegments).mockResolvedValue([{ category: 'sponsor', startMs: 0, endMs: 5000 }]);
		const current = track();
		const playing = player(current);
		lazy.startTrack(playing, current);
		await vi.waitFor(() => expect(playing.seek).toHaveBeenCalledWith(5000));
		expect(mixerService.isOverlapActive).toHaveBeenCalledWith('guild');
		lazy.stop(playing);
	});
});
