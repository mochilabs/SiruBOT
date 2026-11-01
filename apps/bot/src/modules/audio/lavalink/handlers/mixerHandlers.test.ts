import { describe, expect, it } from 'vitest';
import type { Track } from 'lavalink-client';
import { shouldPreserveTransition } from './mixerHandlers.ts';

function createTrack(overrides: Partial<Track> = {}): Track {
	return {
		encoded: 'enc',
		info: {
			identifier: 'id',
			title: 'Title',
			author: 'Author',
			length: 180000,
			isSeekable: true,
			isStream: false,
			uri: 'https://example.com',
			artworkUrl: null,
			sourceName: 'youtube'
		},
		userData: {},
		...overrides
	} as unknown as Track;
}

describe('shouldPreserveTransition', () => {
	it('returns false when either track is missing', () => {
		expect(shouldPreserveTransition(null, null)).toBe(false);
		expect(shouldPreserveTransition(createTrack(), null)).toBe(false);
		expect(shouldPreserveTransition(null, createTrack())).toBe(false);
	});

	it('returns true when next track explicitly requests preserveTransition in userData', () => {
		const current = createTrack();
		const next = createTrack({ userData: { preserveTransition: 'true' } });
		expect(shouldPreserveTransition(current, next)).toBe(true);
	});

	it('returns true when both tracks share the same album via pluginInfo', () => {
		const current = createTrack({
			pluginInfo: { albumName: 'Dark Side of the Moon' }
		} as unknown as Partial<Track>);
		const next = createTrack({
			pluginInfo: { albumName: 'Dark Side of the Moon' }
		} as unknown as Partial<Track>);
		expect(shouldPreserveTransition(current, next)).toBe(true);
	});

	it('returns true when both tracks share the same album via userData.album', () => {
		const current = createTrack({ userData: { album: 'Abbey Road' } });
		const next = createTrack({ userData: { album: 'Abbey Road' } });
		expect(shouldPreserveTransition(current, next)).toBe(true);
	});

	it('returns false when tracks have different albums', () => {
		const current = createTrack({ userData: { album: 'Album A' } });
		const next = createTrack({ userData: { album: 'Album B' } });
		expect(shouldPreserveTransition(current, next)).toBe(false);
	});

	it('returns false when neither track has album metadata and no explicit flag', () => {
		const current = createTrack();
		const next = createTrack();
		expect(shouldPreserveTransition(current, next)).toBe(false);
	});
});
