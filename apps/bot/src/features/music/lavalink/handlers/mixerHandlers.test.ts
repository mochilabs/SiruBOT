import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from 'lavalink-client';
import { handleMixerNeedNext, shouldPreserveTransition } from './mixerHandlers.ts';

const { container } = vi.hoisted(() => ({
	container: {
		logger: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		mixerService: {
			arm: vi.fn(async () => undefined),
			supportsOutgoingEnd: vi.fn(async () => false)
		},
		sponsorBlockService: {
			prefetch: vi.fn(),
			queueChanged: vi.fn(),
			outgoingEndPositionMs: vi.fn(() => undefined)
		},
		guildService: {},
		guildMixer: {
			getMixerSettings: vi.fn(async () => ({
				gaplessEnabled: false,
				crossfadeEnabled: false,
				automixEnabled: true
			}))
		}
	}
}));

vi.mock('../../../../services/guildSettings/mixer.ts', async (orig) => ({ ...(await orig()), ...container.guildMixer }));
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

describe('handleMixerNeedNext with AutoMix (gapless=false)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(container.guildMixer.getMixerSettings).mockResolvedValue({
			gaplessEnabled: false,
			crossfadeEnabled: false,
			automixEnabled: true
		});
	});

	it('gapless=false, automix=true이고 큐에 다음 곡이 있을 때 비어있지 않게 arm한다', async () => {
		const current = createTrack({
			encoded: 'enc-current',
			info: {
				identifier: 'id-current',
				title: 'Current',
				author: 'Author',
				duration: 180000,
				isSeekable: true,
				isStream: false,
				uri: 'https://example.com',
				artworkUrl: null,
				sourceName: 'youtube'
			} as never
		});
		const next = createTrack({
			encoded: 'enc-next',
			info: {
				identifier: 'id-next',
				title: 'Next',
				author: 'Author',
				duration: 180000,
				isSeekable: true,
				isStream: false,
				uri: 'https://example.com',
				artworkUrl: null,
				sourceName: 'youtube'
			} as never
		});
		const player = {
			guildId: 'g-mixer-handler',
			playing: true,
			currentEpoch: 1,
			mixerRuntime: {
				pending: new Map(),
				lastTargetUid: null,
				invalidateTimer: null
			},
			queue: {
				current,
				tracks: [next]
			}
		};

		await handleMixerNeedNext(container as never, player as never, {
			remainingMs: 2000,
			currentTrackEncoded: current.encoded!
		});

		expect(container.mixerService.arm).toHaveBeenCalledWith(
			player,
			expect.objectContaining({
				isEmpty: false,
				encodedTrack: next.encoded
			}),
			expect.any(String)
		);
	});
});
