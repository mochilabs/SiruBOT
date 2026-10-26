import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { container } from '@sapphire/framework';
import type { Player, Track, TrackEndEvent } from 'lavalink-client';
import type { CustomPlayer } from '../modules/audio/lavalink/player/customPlayer.ts';
import { commitLocal, handleMixerAdvanced, handleMixerOverridden, handleMixerTrackEnd } from '../modules/audio/lavalink/handlers/mixerHandlers.ts';
import { getTargetNextTrack } from '../modules/audio/lavalink/queue/queueWrapper.ts';
import { MixerService } from './mixerService.ts';
vi.mock('@sapphire/framework', () => ({
	container: {
		logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
		guildService: {
			getMixerSettings: vi
				.fn()
				.mockResolvedValue({ gaplessEnabled: true, crossfadeEnabled: true, crossfadeMs: 3000, normalizationEnabled: false })
		},
		playerNotifier: { updateController: vi.fn() }
	}
}));

function fakePlayer(): Player {
	return {
		guildId: '123456789012345678',
		node: { options: { host: 'localhost', port: 2333, authorization: 'node-pw' } }
	} as unknown as Player;
}

describe('MixerService v2 Protocol Tests', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
		globalThis.fetch = fetchMock as unknown as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns the 202 enqueue receipt for announce', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ guildId: '123', id: 42, position: 1, queueLength: 1 }), {
				status: 202,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const service = new MixerService();
		const result = await service.announce(fakePlayer(), 'https://tts.example/clip.mp3', 0.2);
		expect(result).toEqual({ guildId: '123', id: 42, position: 1, queueLength: 1 });
	});

	it('throws MixerRequestError on non-2xx', async () => {
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'bad input' }), { status: 400 }));

		const service = new MixerService();
		await expect(service.announce(fakePlayer(), 'clip', 0.2)).rejects.toMatchObject({
			name: 'MixerRequestError',
			status: 400
		});
	});

	it('arm sends Idempotency-Key header and correct body', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ state: 'ARMED', epoch: 42 }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const service = new MixerService();
		const player = fakePlayer() as CustomPlayer;
		await service.arm(player, { epoch: 42, encodedTrack: 'enc-abc' }, 'test-key-123');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:2333/mixer/queue/arm');
		expect(init.method).toBe('POST');
		expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('test-key-123');
		expect(JSON.parse(init.body as string)).toEqual({
			guildId: '123456789012345678',
			epoch: 42,
			encodedTrack: 'enc-abc',
			isEmpty: false
		});
	});

	it('override sends action and Idempotency-Key header', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ state: 'PLAYING', epoch: 43 }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const service = new MixerService();
		const player = fakePlayer() as CustomPlayer;
		await service.override(player, { epoch: 43, action: 'PLAY_NOW', encodedTrack: 'enc-xyz' }, 'test-key-456');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:2333/mixer/queue/override');
		expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('test-key-456');
		expect(JSON.parse(init.body as string)).toEqual({
			guildId: '123456789012345678',
			epoch: 43,
			action: 'PLAY_NOW',
			encodedTrack: 'enc-xyz'
		});
	});

	it('reset forces lastKnownEpoch update', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ lastKnownEpoch: 100, protocolVersion: 2 }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const service = new MixerService();
		const player = fakePlayer() as CustomPlayer;
		await service.reset(player, 100, 'test-reset-key');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:2333/mixer/reset');
		expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('test-reset-key');
		expect(JSON.parse(init.body as string)).toEqual({
			guildId: '123456789012345678',
			epoch: 100
		});
	});

	it('preloadUpcoming and clearNext notify queue mutation when head track changes', async () => {
		vi.useFakeTimers();
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ state: 'PLAYING', epoch: 2 }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const service = new MixerService();
		(await import('@sapphire/framework')).container.mixerService = service as any;
		const player = {
			...fakePlayer(),
			repeatMode: 'off',
			currentEpoch: 1,
			mixerRuntime: {
				pending: new Map(),
				transitionSeq: 0,
				lastTargetUid: 'uid-old',
				invalidateTimer: null,
				sampleMiss: 0
			},
			queue: {
				current: { encoded: 'cur', userData: { uid: 'uid-cur' } },
				tracks: [{ encoded: 'next-new', userData: { uid: 'uid-new' } }],
				previous: []
			}
		} as unknown as CustomPlayer;

		await service.preloadUpcoming(player);
		expect(player.currentEpoch).toBe(2);
		await vi.advanceTimersByTimeAsync(60);
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:2333/mixer/queue/invalidate',
			expect.objectContaining({ method: 'POST' })
		);
		vi.useRealTimers();
	});

	it('handleMixerNeedNext ignores solo TTS current track and retries 409 when gapless/crossfade are both off', async () => {
		const { handleMixerNeedNext } = await import('../modules/audio/lavalink/handlers/mixerHandlers.ts');
		const { TTS_CLIP_REQUESTER_ID } = await import('../modules/audio/lavalink/requester.ts');
		const { container } = await import('@sapphire/framework');
		const service = new MixerService();
		container.mixerService = service as any;

		const ttsPlayer = {
			...fakePlayer(),
			repeatMode: 'off',
			currentEpoch: 5,
			mixerRuntime: { pending: new Map(), transitionSeq: 0, lastTargetUid: null, invalidateTimer: null, sampleMiss: 0 },
			queue: {
				current: { encoded: 'tts-enc', requester: { id: TTS_CLIP_REQUESTER_ID } },
				tracks: [{ encoded: 'song-a', info: { identifier: 'a' } }],
				previous: []
			}
		} as unknown as CustomPlayer;

		await handleMixerNeedNext(ttsPlayer, { remainingMs: 2000, currentTrackEncoded: 'tts-enc' });
		expect(fetchMock).not.toHaveBeenCalled();

		// Now test Crossfade OFF + Gapless OFF with 409 epoch sync retry
		(container.guildService.getMixerSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			gaplessEnabled: false,
			crossfadeEnabled: false
		});
		fetchMock
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: 'STALE_EPOCH', lastKnownEpoch: 12 }), {
					status: 409,
					headers: { 'Content-Type': 'application/json' }
				})
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ state: 'NO_NEXT', epoch: 12 }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);

		const musicPlayer = {
			...fakePlayer(),
			repeatMode: 'off',
			playing: true,
			currentEpoch: 5,
			mixerRuntime: { pending: new Map(), transitionSeq: 0, lastTargetUid: null, invalidateTimer: null, sampleMiss: 0 },
			queue: {
				current: { encoded: 'song-cur', requester: { id: 'user-1' } },
				tracks: [{ encoded: 'song-next', requester: { id: 'user-1' } }],
				previous: []
			}
		} as unknown as CustomPlayer;

		await handleMixerNeedNext(musicPlayer, { remainingMs: 5000, currentTrackEncoded: 'song-cur' });
		expect(musicPlayer.currentEpoch).toBe(12);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const retryBody = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
		expect(retryBody).toEqual({
			guildId: '123456789012345678',
			epoch: 12,
			encodedTrack: null,
			isEmpty: true
		});
	});

	it('handleMixerNeedNext aborts when the trigger track changes during the settings await (F1)', async () => {
		const { handleMixerNeedNext } = await import('../modules/audio/lavalink/handlers/mixerHandlers.ts');
		const { container } = await import('@sapphire/framework');
		const service = new MixerService();
		container.mixerService = service as any;

		// DB 조회가 지연되는 동안 전이가 진행돼 current가 바뀐다.
		let releaseSettings!: () => void;
		(container.guildService.getMixerSettings as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			new Promise((resolve) => {
				releaseSettings = () => resolve({ gaplessEnabled: true, crossfadeEnabled: true });
			})
		);

		const player = {
			...fakePlayer(),
			repeatMode: 'off',
			playing: true,
			currentEpoch: 5,
			mixerRuntime: { pending: new Map(), transitionSeq: 0, lastTargetUid: null, invalidateTimer: null, sampleMiss: 0 },
			queue: {
				current: { encoded: 'song-a', requester: { id: 'user-1' } },
				tracks: [{ encoded: 'song-b', requester: { id: 'user-1' } }],
				previous: []
			}
		} as unknown as CustomPlayer;

		const promise = handleMixerNeedNext(player, { remainingMs: 5000, currentTrackEncoded: 'song-a' });
		// 전이 완료: current가 다음 곡으로 바뀐다.
		player.queue.current = { encoded: 'song-b', requester: { id: 'user-1' } } as any;
		player.queue.tracks.splice(0, player.queue.tracks.length, { encoded: 'song-c', requester: { id: 'user-1' } } as any);
		releaseSettings();
		await promise;

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('repeatMode=queue returns current track when tracks is empty and rotates queue on commitLocal (B-1)', () => {
		const trackA = { encoded: 'enc-a', info: { identifier: 'id-a' }, userData: { uid: 'uid-a' } } as unknown as Track;
		const trackB = { encoded: 'enc-b', info: { identifier: 'id-b' }, userData: { uid: 'uid-b' } } as unknown as Track;
		const saveMock = vi.fn().mockResolvedValue(undefined);

		const player = {
			...fakePlayer(),
			repeatMode: 'queue',
			currentEpoch: 1,
			transitionState: { confirmedNowPlaying: trackA },
			mixerRuntime: { pending: new Map(), transitionSeq: 0, lastTargetUid: 'uid-b', invalidateTimer: null, sampleMiss: 0 },
			queue: {
				current: trackA,
				tracks: [trackB],
				previous: [],
				utils: { save: saveMock }
			}
		} as unknown as CustomPlayer;

		// Normal advance from A to B in repeatMode=queue rotates A to the back of tracks without bumping epoch
		commitLocal(player, trackB, { invalidate: false, bumpEpoch: false });
		expect(player.queue.current).toBe(trackB);
		expect(player.queue.tracks).toEqual([trackA]);
		expect(player.currentEpoch).toBe(1);
		expect(saveMock).toHaveBeenCalled();

		// Single-track queue in repeatMode=queue targets current
		player.queue.tracks.splice(0, player.queue.tracks.length);
		expect(getTargetNextTrack(player)).toBe(trackB);
	});

	it('handleMixerAdvanced normal commit does not bump currentEpoch or fire invalidate (B-2 / C-01)', async () => {
		const trackA = { encoded: 'enc-a', info: { identifier: 'id-a' }, userData: { uid: 'uid-a' } } as unknown as Track;
		const trackB = { encoded: 'enc-b', info: { identifier: 'id-b' }, userData: { uid: 'uid-b' } } as unknown as Track;
		const trackC = { encoded: 'enc-c', info: { identifier: 'id-c' }, userData: { uid: 'uid-c' } } as unknown as Track;

		const player = {
			...fakePlayer(),
			repeatMode: 'off',
			currentEpoch: 5,
			transitionState: { confirmedNowPlaying: trackA },
			mixerRuntime: { pending: new Map(), transitionSeq: 0, lastTargetUid: 'uid-b', invalidateTimer: null, sampleMiss: 0 },
			queue: {
				current: trackA,
				tracks: [trackB, trackC],
				previous: [],
				utils: { save: vi.fn().mockResolvedValue(undefined) }
			}
		} as unknown as CustomPlayer;

		await handleMixerAdvanced(player, { epoch: 5, encodedTrack: 'enc-b', handoffType: 'CROSSFADE', handoffId: 'h-1' });
		expect(player.queue.current).toBe(trackB);
		expect(player.queue.tracks).toEqual([trackC]);
		expect(player.currentEpoch).toBe(5);
		expect(player.mixerRuntime.lastTargetUid).toBe('uid-c');
		expect(player.mixerRuntime.invalidateTimer).toBeNull();
	});

	it('handleMixerTrackEnd coldStart plays pre-shifted current track when lavalink-client queueTrackEnd already shifted queue (C-03)', async () => {
		vi.useFakeTimers();
		const service = new MixerService();
		container.mixerService = service;

		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ state: 'PLAYING', epoch: 3 }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const trackA = { encoded: 'enc-a', info: { identifier: 'id-a' }, userData: { uid: 'uid-a' } } as unknown as Track;
		const trackB = { encoded: 'enc-b', info: { identifier: 'id-b' }, userData: { uid: 'uid-b' } } as unknown as Track;
		const trackC = { encoded: 'enc-c', info: { identifier: 'id-c' }, userData: { uid: 'uid-c' } } as unknown as Track;

		// Simulate lavalink-client's queueTrackEnd having shifted B into queue.current and A into previous[0]
		const player = {
			...fakePlayer(),
			node: {
				options: { host: 'localhost', port: 2333, authorization: 'node-pw' },
				fetchPlayer: vi.fn().mockResolvedValue({ track: null })
			},
			repeatMode: 'off',
			currentEpoch: 3,
			transitionState: { confirmedNowPlaying: trackA, lastStartedEncoded: 'enc-a' },
			mixerRuntime: { pending: new Map(), transitionSeq: 0, lastTargetUid: 'uid-b', invalidateTimer: null, sampleMiss: 0 },
			queue: {
				current: trackB,
				tracks: [trackC],
				previous: [trackA],
				utils: { save: vi.fn().mockResolvedValue(undefined) }
			}
		} as unknown as CustomPlayer;

		const endEvent = { reason: 'finished', track: { encoded: 'enc-a' } } as unknown as TrackEndEvent;
		const endPromise = handleMixerTrackEnd(player, endEvent);
		await vi.advanceTimersByTimeAsync(250);
		await endPromise;

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:2333/mixer/queue/override');
		expect(JSON.parse(init.body as string)).toEqual({
			guildId: '123456789012345678',
			epoch: 3,
			action: 'PLAY_NOW',
			encodedTrack: 'enc-b'
		});
		// B was played without double-splicing C out of tracks
		expect(player.queue.current).toBe(trackB);
		expect(player.queue.tracks).toEqual([trackC]);

		// Clean up pending timer
		const reqId = (init.headers as Record<string, string>)['Idempotency-Key'];
		handleMixerOverridden(player, { epoch: 3, requestId: reqId, action: 'PLAY_NOW' });
		vi.useRealTimers();
	});
	it('invalidate retries on 409 STALE_EPOCH and observeMixerEvent tracks overlap state (B-11, B-13)', async () => {
		fetchMock
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: 'STALE_EPOCH', lastKnownEpoch: 15 }), {
					status: 409,
					headers: { 'Content-Type': 'application/json' }
				})
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ state: 'PLAYING', epoch: 15, refiredNeedNext: true }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);

		const service = new MixerService();
		const player = {
			...fakePlayer(),
			currentEpoch: 4
		} as unknown as CustomPlayer;

		service.observeMixerEvent({
			op: 'mixer',
			type: 'overlapStart',
			guildId: '123456789012345678',
			track: { identifier: 'rel-1' }
		});
		expect(service.isOverlapActive('123456789012345678')).toBe(true);
		expect(service.getOverlapTrackIdentifier('123456789012345678')).toBe('rel-1');

		await service.invalidate(player, 4);
		expect(player.currentEpoch).toBe(15);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(service.isOverlapActive('123456789012345678')).toBe(false);
	});
});
