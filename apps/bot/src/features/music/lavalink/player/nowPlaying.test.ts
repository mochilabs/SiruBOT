import { describe, expect, it } from 'vitest';
import type { Track } from 'lavalink-client';
import { nowPlayingTrack } from './nowPlaying.ts';
import type { CustomPlayer } from './customPlayer.ts';

function track(encoded: string, identifier: string): Track {
	return { encoded, info: { identifier, title: `title-${identifier}` } } as unknown as Track;
}

function player(confirmedNowPlaying: Track | null, current: Track | null): CustomPlayer {
	return {
		queue: { current },
		transitionState: {
			stopByCommand: false,
			lastStartedEncoded: null,
			preloadConsumedAt: null,
			confirmedNowPlaying,
			serverConsumedTrack: null
		}
	} as unknown as CustomPlayer;
}

describe('nowPlayingTrack', () => {
	it('renders the confirmed track even when the library displaced queue.current', () => {
		const confirmed = track('enc-a', 'id-a');
		expect(nowPlayingTrack(player(confirmed, track('enc-x', 'id-x')))).toBe(confirmed);
	});

	it('falls back to queue.current before any track was confirmed', () => {
		const current = track('enc-x', 'id-x');
		expect(nowPlayingTrack(player(null, current))).toBe(current);
	});

	it('returns null when nothing is known', () => {
		expect(nowPlayingTrack(player(null, null))).toBeNull();
	});
});
