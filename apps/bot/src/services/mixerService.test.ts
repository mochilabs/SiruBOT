import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { container } from '@sapphire/framework';
import type { Player, Track, TrackEndEvent } from 'lavalink-client';
import type { CustomPlayer } from '../modules/audio/lavalink/player/customPlayer.ts';
import { RelatedTrackHistory } from '../modules/audio/lavalink/player/relatedTrackHistory.ts';
import { commitLocal, handleMixerAdvanced, handleMixerOverridden, handleMixerTrackEnd } from '../modules/audio/lavalink/handlers/mixerHandlers.ts';
import { getTargetNextTrack } from '../modules/audio/lavalink/queue/queueWrapper.ts';
import { MixerService } from './mixerService.ts';
import * as guildMixer from './guildSettings/mixer.ts';

vi.mock('./guildSettings/mixer.ts', () => ({
	getMixerSettings: vi.fn().mockResolvedValue({ gaplessEnabled: true, crossfadeEnabled: true, crossfadeMs: 3000, normalizationEnabled: false })
}));
vi.mock('@sapphire/framework', () => ({
	container: {
		logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
		guildService: {},
		playerNotifier: { updateController: vi.fn() }
	}
}));

function fakePlayer(): Player {
	return {
		relatedTrackHistory: new RelatedTrackHistory(),
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

	it('retries busy analysis and clears a removed target', async () => {
		const service = new MixerService();
		const player = fakePlayer() as CustomPlayer;
		const track = { encoded: 'next', info: { isSeekable: true, isStream: false } } as Track;
		vi.mocked(guildMixer.getMixerSettings).mockResolvedValue({ automixEnabled: true } as any);
		fetchMock.mockImplementation(
			async (url: string) =>
				new Response(JSON.stringify(url.includes('/state') ? { adaptiveTransitionsSupported: true } : { accepted: false }), { status: 202 })
		);
		await service.prepareNextAnalysis(player, track);
		await service.prepareNextAnalysis(player, track);
		expect(fetchMock).toHaveBeenCalledTimes(4);
		fetchMock.mockImplementation(
			async (url: string) =>
				new Response(JSON.stringify(url.includes('/state') ? { adaptiveTransitionsSupported: true } : { accepted: true }), { status: 202 })
		);
		await service.prepareNextAnalysis(player, track);
		await service.prepareNextAnalysis(player, null);
		await service.prepareNextAnalysis(player, track);
		expect(fetchMock).toHaveBeenCalledTimes(8);
		vi.mocked(guildMixer.getMixerSettings).mockResolvedValue({ automixEnabled: false } as any);
	});

	it('does not POST to a different node after an awaited capability response', async () => {
		const service = new MixerService();
		const player = fakePlayer() as CustomPlayer;
		const track = { encoded: 'next', info: { isSeekable: true, isStream: false } } as Track;
		vi.mocked(guildMixer.getMixerSettings).mockResolvedValueOnce({ automixEnabled: true } as any);
		const response = new Response(JSON.stringify({ adaptiveTransitionsSupported: true }));
		const result = Promise.withResolvers<typeof response>();
		fetchMock.mockReturnValueOnce(result.promise);
		const analysis = service.prepareNextAnalysis(player, track);
		await Promise.resolve();
		Object.assign(player, { node: { options: { host: 'new', port: 2333 } } });
		result.resolve(response);
		await analysis;
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('sends preservation only when explicitly supplied to arm', async () => {
		fetchMock.mockImplementation(async () => new Response('{}'));
		const service = new MixerService();
		const player = fakePlayer() as CustomPlayer;
		await service.arm(player, { epoch: 1, encodedTrack: 'next' });
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('preserveTransition');
		await service.arm(player, { epoch: 2, encodedTrack: 'next', preserveTransition: true });
		expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toHaveProperty('preserveTransition', true);
	});

	it('serializes incoming and outgoing SponsorBlock boundary positions', async () => {
		fetchMock.mockResolvedValue(new Response('{}'));
		const service = new MixerService();
		await service.arm(fakePlayer() as CustomPlayer, {
			epoch: 3,
			encodedTrack: 'next',
			startPositionMs: 12000,
			outgoingEndPositionMs: 54000
		});
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
			startPositionMs: 12000,
			outgoingEndPositionMs: 54000
		});
	});

	it('warms analysis once per target only with AutoMix and server support', async () => {
		const service = new MixerService();
		const player = fakePlayer() as CustomPlayer;
		const track = { encoded: 'next', info: { isSeekable: true, isStream: false } } as Track;
		vi.mocked(guildMixer.getMixerSettings).mockResolvedValueOnce({ automixEnabled: true } as any);
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ adaptiveTransitionsSupported: true })));
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true }), { status: 202 }));
		await Promise.all([service.prepareNextAnalysis(player, track), service.prepareNextAnalysis(player, track)]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[1][0]).toContain('/mixer/analyze');
		expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ guildId: player.guildId, encodedTrack: 'next' });
		await service.prepareNextAnalysis(player, track);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('skips early analysis for disabled settings, streams, unsupported servers and errors', async () => {
		const player = fakePlayer() as CustomPlayer;
		const track = { encoded: 'next', info: { isSeekable: true, isStream: false } } as Track;
		await new MixerService().prepareNextAnalysis(player, track);
		expect(fetchMock).not.toHaveBeenCalled();
		vi.mocked(guildMixer.getMixerSettings).mockResolvedValueOnce({ automixEnabled: true } as any);
		fetchMock.mockResolvedValueOnce(new Response('{}'));
		await new MixerService().prepareNextAnalysis(player, track);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		vi.mocked(guildMixer.getMixerSettings).mockResolvedValueOnce({ automixEnabled: true } as any);
		fetchMock.mockRejectedValueOnce(new Error('offline'));
		await expect(new MixerService().prepareNextAnalysis(player, track)).resolves.toBeUndefined();
		await new MixerService().prepareNextAnalysis(player, { ...track, info: { ...track.info, isStream: true } });
		expect(fetchMock).toHaveBeenCalledTimes(2);
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
				tracks: [{ encoded: 'next-new', info: { isSeekable: true, isStream: false }, userData: { uid: 'uid-new' } }],
				previous: []
			}
		} as unknown as CustomPlayer;

		await service.preloadUpcoming(player);
		expect(player.currentEpoch).toBe(2);
		await vi.advanceTimersByTimeAsync(60);
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:2333/mixer/queue/invalidate', expect.objectContaining({ method: 'POST' }));
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
		(guildMixer.getMixerSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
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
		(guildMixer.getMixerSettings as ReturnType<typeof vi.fn>).mockReturnValueOnce(
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
		expect(player.relatedTrackHistory.has(trackB)).toBe(true);
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
		expect(player.relatedTrackHistory.has(trackB)).toBe(true);
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

	it('handleMixerTrackEnd coldStart matches ended track even when Lavaplayer TrackEndEvent encodes non-zero end position', async () => {
		vi.useFakeTimers();
		const service = new MixerService();
		container.mixerService = service;
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ state: 'PLAYING', epoch: 3, duplicate: false }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const posZeroA =
			'QAAA4QMANe2YgeuqheuPhOykkSDpnanlkb3pgZPkuK0gKEFpTkEgVEhFIEVORCkgLyBtaWxsIGNvdmVyAARtaWxsAAAAAAADAYgAC09XbktPWWJHMjNBAAEAK2h0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9T1duS09ZYkcyM0EBAD9odHRwczovL2kueXRpbWcuY29tL3ZpL09XbktPWWJHMjNBL21heHJlc2RlZmF1bHQuanBnP3Y9NjkxMTcwYjYAABJ5b3V0dWJlLWZpbGUtY2FjaGUAAAAAAAAAAA==';
		const bufA = Buffer.from(posZeroA, 'base64');
		bufA.writeBigUInt64BE(196510n, bufA.length - 8);
		const posEndA = bufA.toString('base64');
		const encB =
			'QAAAuwMAHk92ZXJkb3NlIChuYXRvcmkpIC8gbWlsbCBjb3ZlcgAEbWlsbAAAAAAAAvXQAAtBYkJyZUdiMk1uQQABACtodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUFiQnJlR2IyTW5BAQAwaHR0cHM6Ly9pLnl0aW1nLmNvbS92aS9BYkJyZUdiMk1uQS9tcWRlZmF1bHQuanBnAAASeW91dHViZS1maWxlLWNhY2hlAAAAAAAAAAA=';

		const trackA = { encoded: posZeroA, info: { identifier: 'OWnKOYbG23A', title: 'A' }, userData: { uid: 'uid-a' } } as unknown as Track;
		const trackB = {
			encoded: encB,
			info: { identifier: 'AbBreGb2MnA', title: 'Overdose' },
			userData: { uid: 'uid-b', requester: { id: 'related_track' } }
		} as unknown as Track;

		const player = {
			...fakePlayer(),
			currentEpoch: 3,
			repeatMode: 'off',
			node: {
				...fakePlayer().node,
				fetchPlayer: vi.fn().mockResolvedValue({ track: null })
			},
			transitionState: {
				confirmedNowPlaying: trackA,
				lastStartedEncoded: posZeroA,
				stopByCommand: false,
				preloadConsumedAt: null,
				serverConsumedTrack: null,
				lastRecordedKey: null
			},
			mixerRuntime: { pending: new Map(), transitionSeq: 0, lastTargetUid: 'uid-b', invalidateTimer: null, sampleMiss: 0 },
			queue: {
				current: trackB,
				previous: [trackA],
				tracks: [],
				utils: { save: vi.fn().mockResolvedValue(undefined) }
			}
		} as unknown as CustomPlayer;

		const endEvent = { reason: 'finished', track: { encoded: posEndA, info: { identifier: 'OWnKOYbG23A' } } } as unknown as TrackEndEvent;
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
			encodedTrack: encB
		});
		expect(player.transitionState.confirmedNowPlaying).toBe(trackB);

		const reqId = (init.headers as Record<string, string>)['Idempotency-Key'];
		handleMixerOverridden(player, { epoch: 3, requestId: reqId, action: 'PLAY_NOW' });
		vi.useRealTimers();
	});
});

describe('AutoMix configuration', () => {
	const settings = {
		gaplessEnabled: true,
		crossfadeEnabled: true,
		crossfadeMs: 5000,
		normalizationEnabled: false,
		automixEnabled: true,
		automixMaxTempoChange: 0.06,
		automixMinConfidence: 0.3
	};
	const supported = { bpmDetectionEnabled: false, beatmatchEnabled: false };

	afterEach(() => vi.unstubAllGlobals());

	it('enables analysis and beat matching before configuring the overlap', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(supported)));
		vi.stubGlobal('fetch', fetchMock);
		await new MixerService().setAutomix(fakePlayer(), settings);
		expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/mixer/state', '/mixer/bpm', '/mixer/crossfade']);
		expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
			guildId: fakePlayer().guildId,
			enabled: true,
			beatmatchEnabled: true,
			maxTempoChange: 0.06,
			minConfidence: 0.3
		});
	});

	it('keeps ordinary crossfades working on an older plugin when AutoMix is off', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => new Response('{}'));
		vi.stubGlobal('fetch', fetchMock);
		await new MixerService().setAutomix(fakePlayer(), { ...settings, automixEnabled: false });
		expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/mixer/state', '/mixer/crossfade']);
	});

	it('rejects enabling AutoMix on an older plugin before changing crossfade settings', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
		vi.stubGlobal('fetch', fetchMock);
		await expect(new MixerService().setAutomix(fakePlayer(), settings)).rejects.toThrow('AutoMix를 지원하지');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('disables both analysis gates before disabling crossfade', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(supported)));
		vi.stubGlobal('fetch', fetchMock);
		await new MixerService().setCrossfade(fakePlayer(), false);
		expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ enabled: false, beatmatchEnabled: false });
		expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({ enabled: false });
	});

	it('restores ordinary mixer settings when a saved AutoMix preference meets an older node', async () => {
		vi.mocked(guildMixer.getMixerSettings).mockResolvedValueOnce(settings).mockResolvedValueOnce(settings);
		const fetchMock = vi.fn().mockImplementation(async () => new Response('{}'));
		vi.stubGlobal('fetch', fetchMock);
		await new MixerService().pushCrossfadeConfig(fakePlayer());
		expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
			'/mixer/state',
			'/mixer/crossfade',
			'/mixer/normalization',
			'/mixer/silence'
		]);
	});

	it('restores persisted AutoMix settings through the player initialization path', async () => {
		vi.mocked(guildMixer.getMixerSettings).mockResolvedValueOnce(settings).mockResolvedValueOnce(settings);
		const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(supported)));
		vi.stubGlobal('fetch', fetchMock);
		await new MixerService().pushCrossfadeConfig(fakePlayer());
		expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
			'/mixer/state',
			'/mixer/bpm',
			'/mixer/crossfade',
			'/mixer/normalization',
			'/mixer/silence'
		]);
		expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ enabled: true, beatmatchEnabled: true });
	});

	it('pushCrossfadeConfig sends enabled: false to /mixer/silence when gapless is false and automix is true', async () => {
		const customSettings = {
			gaplessEnabled: false,
			crossfadeEnabled: true,
			automixEnabled: true,
			crossfadeMs: 3000,
			normalizationEnabled: false,
			automixMaxTempoChange: 0.06,
			automixMinConfidence: 0.3
		};
		vi.mocked(guildMixer.getMixerSettings).mockReset();
		vi.mocked(guildMixer.getMixerSettings).mockResolvedValue(customSettings);
		const fetchMock = vi.fn().mockImplementation(async () => new Response('{}'));
		vi.stubGlobal('fetch', fetchMock);
		const service = new MixerService();
		await service.pushCrossfadeConfig(fakePlayer());
		const silenceCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/mixer/silence'));
		expect(silenceCall).toBeDefined();
		expect(JSON.parse(silenceCall![1].body)).toEqual({ guildId: '123456789012345678', enabled: false });
	});
});

it('sends silence config matching gapless setting', async () => {
	const fetchMock = vi.fn().mockImplementation(async () => new Response('{}'));
	vi.stubGlobal('fetch', fetchMock);
	const service = new MixerService();
	await service.setSilence(fakePlayer(), true);
	expect(fetchMock.mock.calls[0][0]).toContain('/mixer/silence');
	expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ guildId: '123456789012345678', enabled: true });
});
