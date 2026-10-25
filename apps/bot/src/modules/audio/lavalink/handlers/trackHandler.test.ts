import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { container } from '@sapphire/framework';
import type { Track, TrackEndEvent, TrackStartEvent } from 'lavalink-client';
import { TrackHandler } from './trackHandler.ts';

const {
	getSubLogger,
	reportPlaybackEvent,
	playerNotifierUpdate,
	publishPlayerState,
	publishPlayerEnded,
	clearPlayerStateTracker,
	getInFlightRelatedFetch,
	queueRelatedUpfront,
	fetchYouTubeChapters,
	mixerService
} = vi.hoisted(() => ({
	getSubLogger: vi.fn(),
	reportPlaybackEvent: vi.fn(),
	playerNotifierUpdate: vi.fn(),
	publishPlayerState: vi.fn(),
	publishPlayerEnded: vi.fn(),
	clearPlayerStateTracker: vi.fn(),
	getInFlightRelatedFetch: vi.fn(() => undefined),
	queueRelatedUpfront: vi.fn(async () => undefined),
	fetchYouTubeChapters: vi.fn(async () => []),
	mixerService: {
		markUnmanaged: vi.fn(),
		isPreloaded: vi.fn(() => false),
		skip: vi.fn(),
		clearNext: vi.fn(),
		primeForPlay: vi.fn(),
		takePreloadedIdentifier: vi.fn(() => null)
	}
}));
const stubLogger = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock('@sapphire/framework', () => ({
	container: { logger: { getSubLogger }, playerNotifier: { updateController: playerNotifierUpdate }, mixerService }
}));
vi.mock('../../../../services/playbackReporter.ts', () => ({ reportPlaybackEvent }));
vi.mock('../playerStatePublisher.ts', () => ({ publishPlayerState, publishPlayerEnded, clearPlayerStateTracker }));
vi.mock('../autoPlayRelated.ts', () => ({ getInFlightRelatedFetch, queueRelatedUpfront }));
vi.mock('../../../../services/dataApiClient.ts', () => ({ fetchYouTubeChapters }));
vi.mock('@sentry/node', () => ({
	withScope: vi.fn((callback: (scope: { setTag: (key: string, value: string) => void }) => void) => callback({ setTag: vi.fn() })),
	captureException: vi.fn()
}));

function makeHandler() {
	const buildTrack = vi.fn((payload: { encoded: string; info?: Record<string, unknown> }) => ({
		encoded: payload.encoded,
		info: payload.info ?? {},
		requester: undefined
	}));
	const manager = { on: vi.fn(), utils: { buildTrack }, removeAllListeners: vi.fn() };
	const handler = new TrackHandler(manager as never);
	return { handler: handler as unknown as { [key: string]: any }, buildTrack, manager };
}

function track(encoded: string, identifier?: string): Track {
	return { encoded, info: { identifier, title: `title-${encoded}` }, requester: { id: 'user-1' } } as unknown as Track;
}

function startEvent(encoded?: string, identifier?: string): TrackStartEvent {
	return { track: encoded ? { encoded, info: { identifier } } : null } as unknown as TrackStartEvent;
}

describe('resolveStartedTrack', () => {
	beforeEach(() => {
		getSubLogger.mockReturnValue(stubLogger);
	});

	it('keeps the client track when the payload has no encoded id', () => {
		const { handler, buildTrack } = makeHandler();
		const clientTrack = track('client-enc', 'id-a');
		const player = { guildId: 'g', queue: { tracks: [] } };
		const resolved = handler.trackStartOrchestrator.resolveStartedTrack(player, clientTrack, startEvent(), null);
		expect(resolved).toBe(clientTrack);
		expect(buildTrack).not.toHaveBeenCalled();
	});

	it('keeps the client track when the payload encoded id matches it', () => {
		const { handler } = makeHandler();
		const clientTrack = track('same-enc', 'id-a');
		const player = { guildId: 'g', queue: { tracks: [] } };
		expect(handler.trackStartOrchestrator.resolveStartedTrack(player, clientTrack, startEvent('same-enc', 'id-a'), null)).toBe(clientTrack);
	});

	it('prefers the client track when identifiers match even though encoded ids differ (stale server metadata)', () => {
		const { handler, buildTrack } = makeHandler();
		const clientTrack = track('client-enc', 'id-a');
		const player = { guildId: 'g', queue: { tracks: [] } };
		expect(handler.trackStartOrchestrator.resolveStartedTrack(player, clientTrack, startEvent('server-enc', 'id-a'), null)).toBe(clientTrack);
		expect(buildTrack).not.toHaveBeenCalled();
	});

	it('resolves to the queued track object when the payload identifier matches a queued track', () => {
		const { handler, buildTrack } = makeHandler();
		const clientTrack = track('client-enc', 'id-a');
		const queued = track('queued-enc', 'id-b');
		const player = { guildId: 'g', queue: { tracks: [queued] } };
		const resolved = handler.trackStartOrchestrator.resolveStartedTrack(player, clientTrack, startEvent('server-enc', 'id-b'), null);
		expect(resolved).toBe(queued);
		expect(buildTrack).not.toHaveBeenCalled();
	});

	it('falls back to the server payload track when nothing matches', () => {
		const { handler, buildTrack } = makeHandler();
		const clientTrack = track('client-enc', 'id-a');
		const player = { guildId: 'g', queue: { tracks: [] } };
		const resolved = handler.trackStartOrchestrator.resolveStartedTrack(player, clientTrack, startEvent('server-enc', 'id-z'), null);
		expect(buildTrack).toHaveBeenCalledWith(expect.objectContaining({ encoded: 'server-enc' }), undefined);
		expect(resolved).toEqual(expect.objectContaining({ encoded: 'server-enc' }));
	});

	it('warns when the started track is neither the preloaded one nor a known queue entry', () => {
		const { handler } = makeHandler();
		const clientTrack = track('client-enc', 'id-a');
		const player = { guildId: 'g', queue: { tracks: [] } };
		handler.trackStartOrchestrator.resolveStartedTrack(player, clientTrack, startEvent('server-enc', 'id-z'), 'preloaded-id');
		expect(stubLogger.warn).toHaveBeenCalled();
	});
});

describe('isTransitionAlreadyStarted', () => {
	beforeEach(() => {
		getSubLogger.mockReturnValue(stubLogger);
	});

	it('treats a track end for the last started track as an in-progress transition', () => {
		const { handler } = makeHandler();
		const player = { transitionState: { lastStartedEncoded: 'started-enc' } };
		expect(handler.isTransitionAlreadyStarted(player, track('started-enc'))).toBe(false);
	});

	it('detects an already-started transition when the ended track differs from the last started one', () => {
		const { handler } = makeHandler();
		const player = { transitionState: { lastStartedEncoded: 'started-enc' } };
		expect(handler.isTransitionAlreadyStarted(player, track('old-enc'))).toBe(true);
	});

	it('returns false for non-string encoded ids or missing history', () => {
		const { handler } = makeHandler();
		const player = { transitionState: { lastStartedEncoded: null } };
		expect(handler.isTransitionAlreadyStarted(player, track('old-enc'))).toBe(false);
		expect(handler.isTransitionAlreadyStarted(player, null)).toBe(false);
	});
});

describe('trackError 사유 보고 (상태 페이지 최근 재생 오류)', () => {
	beforeEach(() => {
		getSubLogger.mockReturnValue(stubLogger);
		reportPlaybackEvent.mockClear();
		// handleTrackFailure가 스킵 분기로 빠지도록 mixerService를 고정해요 (sendNotification 경로 회피)
		Object.assign(container, {
			mixerService: {
				consumePreloaded: () => false,
				skip: vi.fn().mockResolvedValue(undefined),
				markUnmanaged: vi.fn()
			}
		});
	});

	function playerStub() {
		return { guildId: 'g-1', consecutiveErrors: 0, queue: { tracks: [{}] } };
	}

	it('reports the lavalink exception message as the reason', async () => {
		const { handler } = makeHandler();
		await handler.handleTrackError(playerStub(), track('enc-1'), {
			exception: { severity: 'COMMON', message: 'This video is age restricted', cause: 'cause', causeStackTrace: '' },
			error: 'fallback'
		});
		expect(reportPlaybackEvent).toHaveBeenCalledWith(
			'g-1',
			'track_error',
			expect.anything(),
			expect.objectContaining({ reason: 'This video is age restricted', consecutiveErrors: 1 })
		);
	});

	it('falls back to the exception cause when the message is empty', async () => {
		const { handler } = makeHandler();
		await handler.handleTrackError(playerStub(), track('enc-1'), {
			exception: { severity: 'COMMON', message: '  ', cause: 'Video unavailable', causeStackTrace: '' },
			error: ''
		});
		expect(reportPlaybackEvent).toHaveBeenCalledWith(
			'g-1',
			'track_error',
			expect.anything(),
			expect.objectContaining({ reason: 'Video unavailable' })
		);
	});

	it('truncates long reasons to the data-api limit of 200 chars', async () => {
		const { handler } = makeHandler();
		await handler.handleTrackError(playerStub(), track('enc-1'), {
			exception: { severity: 'FAULT', message: 'x'.repeat(500), cause: '', causeStackTrace: '' },
			error: ''
		});
		expect(reportPlaybackEvent.mock.calls[0][3].reason).toHaveLength(200);
	});

	it('omits the reason key when the payload carries no text', async () => {
		const { handler } = makeHandler();
		await handler.handleTrackError(playerStub(), track('enc-1'), {
			exception: { severity: 'COMMON', message: '', cause: '', causeStackTrace: '' },
			error: ''
		});
		expect(reportPlaybackEvent.mock.calls[0][3]).toEqual({ consecutiveErrors: 1 });
	});
});

function transitionPlayer(serverResponse: unknown) {
	return {
		guildId: 'g',
		queue: { current: null, tracks: [], previous: [] },
		playing: true,
		paused: false,
		transitionState: { stopByCommand: false, lastStartedEncoded: null, preloadConsumedAt: null },
		node: { fetchPlayer: vi.fn(async () => serverResponse) },
		play: vi.fn()
	} as unknown as { [key: string]: any };
}

describe('reconcileNowPlaying', () => {
	beforeEach(() => {
		getSubLogger.mockReturnValue(stubLogger);
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('restores the started track when the server is playing the same video', async () => {
		const { handler } = makeHandler();
		const started = track('started-enc', 'id-a');
		const displaced = track('displaced-enc', 'id-x');
		const player = transitionPlayer({ track: { encoded: 'server-enc', info: { identifier: 'id-a' } }, paused: false });
		player.queue.current = displaced;
		player.transitionState.lastStartedEncoded = 'started-enc';

		await handler.playbackWatchdog.reconcileNowPlaying(player, started, 'started-enc');

		expect(player.queue.current).toBe(started);
		expect(player.queue.tracks[0]).toBe(displaced);
	});

	it('follows the server when it is playing a different track', async () => {
		const { handler } = makeHandler();
		const started = track('started-enc', 'id-a');
		const displaced = track('displaced-enc', 'id-x');
		const player = transitionPlayer({ track: { encoded: 'server-enc', info: { identifier: 'id-z' } }, paused: false });
		player.queue.current = displaced;
		player.transitionState.lastStartedEncoded = 'started-enc';

		await handler.playbackWatchdog.reconcileNowPlaying(player, started, 'started-enc');

		expect(player.queue.current).toEqual(expect.objectContaining({ encoded: 'server-enc' }));
		expect(player.transitionState.lastStartedEncoded).toBe('server-enc');
	});

	it('does not resurrect a finished queue when the server has no track', async () => {
		const { handler } = makeHandler();
		const started = track('started-enc', 'id-a');
		const displaced = track('displaced-enc', 'id-x');
		const player = transitionPlayer({ track: null, paused: false });
		player.queue.current = displaced;
		player.transitionState.lastStartedEncoded = 'started-enc';

		await handler.playbackWatchdog.reconcileNowPlaying(player, started, 'started-enc');

		expect(player.queue.current).toBe(displaced);
		expect(playerNotifierUpdate).not.toHaveBeenCalled();
	});

	it('restores conservatively when the server cannot be queried', async () => {
		const { handler } = makeHandler();
		const started = track('started-enc', 'id-a');
		const player = transitionPlayer(null);
		(player.node.fetchPlayer as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('down'));
		player.queue.current = track('displaced-enc', 'id-x');
		player.transitionState.lastStartedEncoded = 'started-enc';

		await handler.playbackWatchdog.reconcileNowPlaying(player, started, 'started-enc');

		expect(player.queue.current).toBe(started);
	});

	it('reconciles through the timer after the delay', async () => {
		const { handler } = makeHandler();
		const started = track('started-enc', 'id-a');
		const player = transitionPlayer({ track: { encoded: 'started-enc', info: { identifier: 'id-a' } }, paused: false });
		player.queue.current = started;
		handler.setLastStarted(player, started);
		// 라이브러리의 지연 continuation이 current를 밀어낸 상황 재현
		player.queue.current = track('displaced-enc', 'id-x');

		await vi.advanceTimersByTimeAsync(900);

		expect(player.queue.current).toBe(started);
	});
});

describe('startClientOwnedTrack race handling', () => {
	beforeEach(() => {
		getSubLogger.mockReturnValue(stubLogger);
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('stamps the current track only when the server agrees with it', async () => {
		const { handler } = makeHandler();
		const current = track('client-enc', 'id-b');
		const player = transitionPlayer({ track: { encoded: 'server-enc', info: { identifier: 'id-b' } }, paused: false });
		player.queue.current = current;

		await handler.startClientOwnedTrack(player);

		expect(player.transitionState.lastStartedEncoded).toBe('client-enc');
		expect(player.play).not.toHaveBeenCalled();
	});

	it('follows the server track when the client advance lost the race', async () => {
		const { handler } = makeHandler();
		const player = transitionPlayer({ track: { encoded: 'server-enc', info: { identifier: 'id-a' } }, paused: false });
		player.queue.current = track('client-enc', 'id-b');

		await handler.startClientOwnedTrack(player);

		expect(player.queue.current).toEqual(expect.objectContaining({ encoded: 'server-enc' }));
		expect(player.transitionState.lastStartedEncoded).toBe('server-enc');
		expect(player.play).not.toHaveBeenCalled();
	});

	it('play가 거부되면 오류는 던지되 복구용 watchdog은 남긴다 (무음 정체 방지)', async () => {
		const { handler } = makeHandler();
		resetSpies();
		stubPlaybackContainer();
		const player = transitionPlayer(null);
		player.queue.current = track('client-enc', 'id-b');
		player.play = vi.fn().mockRejectedValue(new Error('REST 500'));

		await expect(handler.startClientOwnedTrack(player)).rejects.toThrow('REST 500');

		// 서버에 트랙이 없으니 이후 재생 이벤트가 없다 — 복구 타이머는 반드시 남아 있어야 한다.
		expect(handler.hasWatchdog('g')).toBe(true);
		handler.cleanup();
	});
});

describe('resolveStartedTrack with a server-consumed preheat', () => {
	beforeEach(() => {
		getSubLogger.mockReturnValue(stubLogger);
	});

	it('uses the consumed preheat over the server payload when the track left the queue', () => {
		const { handler, buildTrack } = makeHandler();
		const clientTrack = track('client-enc', 'id-a');
		const consumed = track('fresh-enc', 'id-z');
		const player = {
			guildId: 'g',
			queue: { tracks: [] },
			transitionState: { serverConsumedTrack: consumed }
		};
		const resolved = handler.trackStartOrchestrator.resolveStartedTrack(player, clientTrack, startEvent('server-enc', 'id-z'), null);
		expect(resolved).toBe(consumed);
		expect(buildTrack).not.toHaveBeenCalled();
	});
});

describe('handleTrackEnd: overlap abort 직후 진행 분기', () => {
	beforeEach(() => {
		getSubLogger.mockReturnValue(stubLogger);
		reportPlaybackEvent.mockClear();
		Object.assign(container, {
			chatTtsService: { isTtsEnded: vi.fn(() => false) }
		});
	});

	function endPlayer() {
		return {
			guildId: 'g-1',
			queue: { current: track('b-enc', 'id-b'), tracks: [] },
			transitionState: { stopByCommand: false, lastStartedEncoded: 'a-enc', preloadConsumedAt: null }
		} as unknown as { [key: string]: any };
	}

	it('abort 직후엔 서버 관망 대신 클라이언트 소유 진행으로 즉시 넘어간다', () => {
		const { handler } = makeHandler();
		const player = endPlayer();
		Object.assign(container, { mixerService: { consumePreloaded: vi.fn(() => true), consumeOverlapAbort: vi.fn(() => true) } });
		handler.armWatchdog = vi.fn();
		handler.startClientOwnedTrack = vi.fn(() => Promise.resolve());

		handler.handleTrackEnd(player, track('a-enc', 'id-a'), { reason: 'finished' });

		expect(handler.startClientOwnedTrack).toHaveBeenCalledWith(player);
		expect(handler.armWatchdog).not.toHaveBeenCalled();
		expect(player.transitionState.preloadConsumedAt).toBeNull();
	});

	it('abort가 없으면 서버 소유 관망(예열 소비 + watchdog)을 유지한다', () => {
		const { handler } = makeHandler();
		const player = endPlayer();
		Object.assign(container, { mixerService: { consumePreloaded: vi.fn(() => true), consumeOverlapAbort: vi.fn(() => false) } });
		handler.armWatchdog = vi.fn();
		handler.startClientOwnedTrack = vi.fn(() => Promise.resolve());

		handler.handleTrackEnd(player, track('a-enc', 'id-a'), { reason: 'finished' });

		expect(handler.armWatchdog).toHaveBeenCalledWith(player);
		expect(handler.startClientOwnedTrack).not.toHaveBeenCalled();
		expect(typeof player.transitionState.preloadConsumedAt).toBe('number');
	});

	it('예열이 없으면 abort 기록을 소비하지 않는다', () => {
		const { handler } = makeHandler();
		const player = endPlayer();
		const consumeOverlapAbort = vi.fn(() => true);
		Object.assign(container, { mixerService: { consumePreloaded: vi.fn(() => false), consumeOverlapAbort } });
		handler.startClientOwnedTrack = vi.fn(() => Promise.resolve());

		handler.handleTrackEnd(player, track('a-enc', 'id-a'), { reason: 'finished' });

		expect(consumeOverlapAbort).not.toHaveBeenCalled();
		expect(handler.startClientOwnedTrack).toHaveBeenCalledWith(player);
	});

	it('β 순서에서 신곡이 이미 시작된 뒤 도착한 구곡 finished trackEnd는 클라이언트 진행 및 watchdog을 건너뛴다', () => {
		const { handler } = makeHandler();
		const player = endPlayer();
		player.transitionState.lastStartedEncoded = 'b-enc';
		player.queue.current = track('b-enc', 'id-b');
		const consumePreloaded = vi.fn(() => false);
		Object.assign(container, { mixerService: { consumePreloaded, consumeOverlapAbort: vi.fn(() => false) } });
		handler.armWatchdog = vi.fn();
		handler.startClientOwnedTrack = vi.fn(() => Promise.resolve());

		handler.handleTrackEnd(player, track('b-enc', 'id-b'), { reason: 'finished', track: { encoded: 'a-enc', info: { identifier: 'id-a' } } } as unknown as TrackEndEvent);

		expect(handler.startClientOwnedTrack).not.toHaveBeenCalled();
		expect(handler.armWatchdog).not.toHaveBeenCalled();
		expect(consumePreloaded).not.toHaveBeenCalled();
	});
});

/* ─── 공개 계약 고정: 이벤트 흐름 전체 경로 (start→end→advance, 실패/종료/타이머 정리) ─── */

function ttsTrack(encoded: string, identifier?: string): Track {
	return { encoded, info: { identifier, title: `title-${encoded}` }, requester: { id: 'chat_tts_clip' } } as unknown as Track;
}

function fullPlayer(overrides: Record<string, unknown> = {}) {
	return {
		guildId: 'g-1',
		consecutiveErrors: 0,
		playing: false,
		paused: false,
		textChannelId: 'tc-1',
		chapters: [],
		chaptersTrackIdentifier: null,
		queue: { current: null, tracks: [] as unknown[], previous: [] as unknown[] },
		transitionState: {
			stopByCommand: false,
			lastStartedEncoded: null as string | null,
			preloadConsumedAt: null as number | null,
			confirmedNowPlaying: null,
			serverConsumedTrack: null
		},
		node: { fetchPlayer: vi.fn(async () => ({ track: null, paused: false })) },
		play: vi.fn(async () => undefined),
		stopPlaying: vi.fn(async () => undefined),
		disconnect: vi.fn(async () => undefined),
		...overrides
	} as unknown as { [key: string]: any };
}

const channelSend = vi.fn(async (_payload: unknown) => undefined);
/** 테스트별로 생성한 핸들러 — afterEach에서 cleanup해 남은 타이머가 다음 테스트를 오염시키지 않게 한다. */
const handlerBin: Array<{ [key: string]: any }> = [];

function makeTrackedHandler() {
	const made = makeHandler();
	handlerBin.push(made.handler);
	return made;
}

function stubPlaybackContainer(mixerOverrides: Record<string, unknown> = {}) {
	Object.assign(container, {
		mixerService: {
			takePreloadedIdentifier: vi.fn(() => null),
			consumePreloaded: vi.fn(() => false),
			consumeOverlapAbort: vi.fn(() => false),
			isPreloaded: vi.fn(() => false),
			isOverlapActive: vi.fn(() => false),
			ensureMixerFilter: vi.fn(async () => undefined),
			preloadUpcoming: vi.fn(async () => true),
			markUnmanaged: vi.fn(),
			skip: vi.fn(async () => undefined),
			clearNext: vi.fn(async () => undefined),
			primeForPlay: vi.fn(async () => undefined),
			...mixerOverrides
		},
		trackService: { increasePlays: vi.fn(async () => undefined), addHistory: vi.fn(async () => undefined) },
		playerNotifier: {
			updateController: playerNotifierUpdate,
			onTrackStart: vi.fn(async () => undefined),
			deleteController: vi.fn(async () => undefined)
		},
		chatTtsService: {
			isTtsEnded: vi.fn(() => false),
			drainSoloQueueToAnnounce: vi.fn(async () => undefined),
			keepAliveForTts: vi.fn(async () => undefined),
			clearGuild: vi.fn(),
			clearSoloQueue: vi.fn(),
			seedNextSoloClip: vi.fn(async () => false),
			scrubTtsClips: vi.fn()
		},
		client: { channels: { cache: { get: vi.fn(() => ({ isSendable: () => true, send: channelSend })) } } }
	});
	return {
		mixer: container.mixerService as unknown as { [key: string]: ReturnType<typeof vi.fn> },
		tracks: container.trackService as unknown as { [key: string]: ReturnType<typeof vi.fn> },
		notifier: container.playerNotifier as unknown as { [key: string]: ReturnType<typeof vi.fn> },
		chatTts: container.chatTtsService as unknown as { [key: string]: ReturnType<typeof vi.fn> }
	};
}

function resetSpies() {
	getSubLogger.mockReturnValue(stubLogger);
	reportPlaybackEvent.mockClear();
	playerNotifierUpdate.mockClear();
	publishPlayerState.mockClear();
	publishPlayerEnded.mockClear();
	clearPlayerStateTracker.mockClear();
	queueRelatedUpfront.mockClear();
	channelSend.mockClear();
}

function afterEachCleanup() {
	for (const handler of handlerBin.splice(0)) handler.cleanup();
	vi.useRealTimers();
}

describe('handleTrackStart (시작 확정과 mixer wiring)', () => {
	beforeEach(() => {
		resetSpies();
		stubPlaybackContainer();
	});
	afterEach(afterEachCleanup);

	it('시작한 곡을 NOWPLAYING으로 확정하고 리포트·히스토리·컨트롤러 알림을 보낸다', async () => {
		const { handler } = makeTrackedHandler();
		const { mixer, tracks, notifier, chatTts } = stubPlaybackContainer();
		const player = fullPlayer();
		const started = track('a-enc', 'id-a');

		await handler.handleTrackStart(player, started, startEvent('a-enc', 'id-a'));

		expect(player.transitionState.confirmedNowPlaying).toBe(started);
		expect(player.transitionState.serverConsumedTrack).toBeNull();
		expect(player.transitionState.stopByCommand).toBe(false);
		expect(player.transitionState.preloadConsumedAt).toBeNull();
		expect(player.transitionState.lastStartedEncoded).toBe('a-enc');
		expect(player.consecutiveErrors).toBe(0);
		expect(reportPlaybackEvent).toHaveBeenCalledWith('g-1', 'track_start', started);
		expect(publishPlayerState).toHaveBeenCalledWith(player);
		expect(mixer.ensureMixerFilter).toHaveBeenCalledWith(player);
		expect(mixer.preloadUpcoming).toHaveBeenCalledWith(player);
		expect(queueRelatedUpfront).not.toHaveBeenCalled();
		expect(notifier.onTrackStart).toHaveBeenCalledWith(player);
		expect(chatTts.drainSoloQueueToAnnounce).toHaveBeenCalledWith(player);
		expect(tracks.increasePlays).toHaveBeenCalledWith(started);
		await vi.waitFor(() => expect(tracks.addHistory).toHaveBeenCalledWith('g-1', started));
	});

	it('이전 전이에서 남은 watchdog과 advance-pending 타이머를 정리한다', async () => {
		vi.useFakeTimers();
		const { handler } = makeTrackedHandler();
		stubPlaybackContainer();
		const player = fullPlayer();
		const started = track('a-enc', 'id-a');
		// 이전 전이의 잔재: watchdog 1개 + advance-pending 1개
		handler.armWatchdog(player);
		handler.queueAdvancer.setAdvancePending('g-1');
		expect(vi.getTimerCount()).toBe(2);

		await handler.handleTrackStart(player, started, startEvent('a-enc', 'id-a'));

		// 시작 확정이 둘을 지우고, 전이 확정 리커널(reconcile) 1개만 남는다
		expect(vi.getTimerCount()).toBe(1);
	});

	it('TTS 클립 시작은 컨트롤러 알림과 히스토리 기록을 생략한다', async () => {
		const { handler } = makeTrackedHandler();
		const { tracks, notifier, chatTts } = stubPlaybackContainer();
		const player = fullPlayer();
		const clip = ttsTrack('tts-enc', 'id-t');

		await handler.handleTrackStart(player, clip, startEvent('tts-enc', 'id-t'));

		expect(player.transitionState.confirmedNowPlaying).toBe(clip);
		expect(player.transitionState.lastStartedEncoded).toBe('tts-enc');
		expect(notifier.onTrackStart).not.toHaveBeenCalled();
		expect(chatTts.drainSoloQueueToAnnounce).not.toHaveBeenCalled();
		expect(tracks.increasePlays).not.toHaveBeenCalled();
		expect(reportPlaybackEvent).toHaveBeenCalledWith('g-1', 'track_start', clip);
	});
});

describe('start → end → advance (클라이언트 소유 전이)', () => {
	beforeEach(() => {
		resetSpies();
		stubPlaybackContainer();
	});
	afterEach(afterEachCleanup);

	it('비예열 길드에서 finished trackEnd가 clearNext → primeForPlay → play(noReplace)로 이어진다', async () => {
		const { handler } = makeTrackedHandler();
		const { mixer } = stubPlaybackContainer();
		const player = fullPlayer();
		player.queue.current = track('b-enc', 'id-b');

		handler.handleTrackEnd(player, track('a-enc', 'id-a'), { reason: 'finished' });

		await vi.waitFor(() => expect(player.play).toHaveBeenCalledWith({ noReplace: true }));
		expect(reportPlaybackEvent).toHaveBeenCalledWith('g-1', 'track_end', expect.anything(), { reason: 'finished' });
		expect(mixer.clearNext).toHaveBeenCalledWith(player);
		expect(mixer.primeForPlay).toHaveBeenCalledWith(player);
	});
});

describe('handleTrackFailure (stuck/error 공통 복구)', () => {
	beforeEach(() => {
		resetSpies();
		stubPlaybackContainer();
	});
	afterEach(afterEachCleanup);

	it('중간 오류는 연속 오류를 누적하고 다음 곡으로 조용히 스킵한다', async () => {
		const { handler } = makeTrackedHandler();
		const { mixer } = stubPlaybackContainer();
		const player = fullPlayer();
		player.queue.tracks = [{}];

		await handler.handleTrackStuck(player, track('c-enc', 'id-c'), {});

		expect(player.consecutiveErrors).toBe(1);
		expect(reportPlaybackEvent).toHaveBeenCalledWith('g-1', 'track_stuck', expect.anything(), { consecutiveErrors: 1 });
		expect(mixer.skip).toHaveBeenCalledWith(player);
		expect(channelSend).not.toHaveBeenCalled();
	});

	it('연속 오류 상한에 도달하면 중단·알림·연결 해제하고 watchdog을 해제한다', async () => {
		vi.useFakeTimers();
		const { handler } = makeTrackedHandler();
		const { mixer } = stubPlaybackContainer();
		const player = fullPlayer();
		player.consecutiveErrors = 2;
		handler.armWatchdog(player);
		expect(vi.getTimerCount()).toBe(1);

		await handler.handleTrackError(player, track('c-enc', 'id-c'), {
			exception: { severity: 'FAULT', message: 'boom', cause: '', causeStackTrace: '' },
			error: ''
		});

		expect(player.consecutiveErrors).toBe(3);
		expect(reportPlaybackEvent).toHaveBeenCalledWith('g-1', 'playback_abort', expect.anything(), {
			reason: 'max_consecutive_errors',
			consecutiveErrors: 3
		});
		expect(channelSend).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(channelSend.mock.calls[0][0])).toContain('연속 재생 오류');
		expect(player.transitionState.stopByCommand).toBe(true);
		expect(mixer.markUnmanaged).toHaveBeenCalledWith('g-1');
		expect(player.stopPlaying).toHaveBeenCalled();
		expect(player.disconnect).toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('TTS 클립 stuck은 알림·오류 누적 없이 조용히 스킵한다', async () => {
		const { handler } = makeTrackedHandler();
		const { mixer } = stubPlaybackContainer();
		const player = fullPlayer();

		await handler.handleTrackStuck(player, ttsTrack('tts-enc', 'id-t'), {});

		expect(mixer.skip).toHaveBeenCalledWith(player);
		expect(player.consecutiveErrors).toBe(0);
		expect(reportPlaybackEvent).not.toHaveBeenCalled();
		expect(channelSend).not.toHaveBeenCalled();
	});
});

describe('handleQueueEnd', () => {
	beforeEach(() => {
		resetSpies();
		stubPlaybackContainer();
	});
	afterEach(afterEachCleanup);

	it('큐가 정말 끝나면 컨트롤러를 지우고 모두 재생 완료 안내를 보낸다', async () => {
		const { handler } = makeTrackedHandler();
		const { notifier, chatTts } = stubPlaybackContainer();
		const player = fullPlayer();

		await handler.handleQueueEnd(player, track('last-enc', 'id-l'), { reason: 'finished' });

		expect(publishPlayerEnded).toHaveBeenCalledWith(player);
		expect(notifier.deleteController).toHaveBeenCalledWith(player);
		expect(channelSend).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(channelSend.mock.calls[0][0])).toContain('📭 대기열의 모든 곡을 재생했어요.');
		expect(chatTts.keepAliveForTts).toHaveBeenCalledWith(player);
	});

	it('stopByCommand로 끝나면 완료 안내를 보내지 않는다', async () => {
		const { handler } = makeTrackedHandler();
		const { notifier } = stubPlaybackContainer();
		const player = fullPlayer();
		player.transitionState.stopByCommand = true;

		await handler.handleQueueEnd(player, track('last-enc', 'id-l'), { reason: 'stopped' });

		expect(notifier.deleteController).toHaveBeenCalledWith(player);
		expect(channelSend).not.toHaveBeenCalled();
	});

	it('서버 예열 슬롯이 남아 있으면 종료를 미루고 watchdog만 암한다', async () => {
		vi.useFakeTimers();
		const { handler } = makeTrackedHandler();
		const { notifier } = stubPlaybackContainer({ isPreloaded: vi.fn(() => true) });
		const player = fullPlayer();

		await handler.handleQueueEnd(player, track('last-enc', 'id-l'), { reason: 'finished' });

		expect(notifier.deleteController).not.toHaveBeenCalled();
		expect(channelSend).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(1);
	});

	it('크로스페이드 진행 중에는 종료를 미루고 watchdog만 암한다', async () => {
		vi.useFakeTimers();
		const { handler } = makeTrackedHandler();
		const { notifier } = stubPlaybackContainer({ isOverlapActive: vi.fn(() => true) });
		const player = fullPlayer();

		await handler.handleQueueEnd(player, track('last-enc', 'id-l'), { reason: 'finished' });

		expect(notifier.deleteController).not.toHaveBeenCalled();
		expect(channelSend).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(1);
	});

	it('β 착시: 서버가 아직 재생 중이면 current를 복원하고 종료하지 않는다', async () => {
		vi.useFakeTimers();
		const { handler } = makeTrackedHandler();
		const { notifier } = stubPlaybackContainer();
		const player = fullPlayer();
		player.node.fetchPlayer = vi.fn(async () => ({ track: { encoded: 'srv-enc', info: { identifier: 'id-srv' } }, paused: false }));

		await handler.handleQueueEnd(player, track('old-enc', 'id-old'), { reason: 'finished' });

		expect(player.queue.current).toEqual(expect.objectContaining({ encoded: 'srv-enc' }));
		expect(player.transitionState.lastStartedEncoded).toBe('srv-enc');
		expect(player.playing).toBe(true);
		expect(notifier.deleteController).not.toHaveBeenCalled();
		expect(channelSend).not.toHaveBeenCalled();
		expect(playerNotifierUpdate).toHaveBeenCalledWith(player);
		expect(vi.getTimerCount()).toBe(1);
	});
});

describe('handlePlayerDestroy (타이머 정리)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetSpies();
		stubPlaybackContainer();
	});
	afterEach(afterEachCleanup);

	it('arm된 watchdog/reconcile/advance-pending 타이머를 모두 해제하고 길드 상태를 정리한다', async () => {
		const { handler } = makeTrackedHandler();
		const { mixer, chatTts } = stubPlaybackContainer();
		const player = fullPlayer();
		handler.armWatchdog(player);
		handler.queueAdvancer.setAdvancePending('g-1');
		handler.setLastStarted(player, track('a-enc', 'id-a'));
		expect(vi.getTimerCount()).toBe(3);

		await handler.handlePlayerDestroy(player);

		expect(vi.getTimerCount()).toBe(0);
		expect(mixer.markUnmanaged).toHaveBeenCalledWith('g-1');
		expect(chatTts.clearGuild).toHaveBeenCalledWith('g-1');
		expect(mixer.clearNext).toHaveBeenCalledWith(player);
		expect(clearPlayerStateTracker).toHaveBeenCalledWith('g-1');
		expect(player.transitionState.lastStartedEncoded).toBeNull();
	});

	it('destroy 이후 시간이 지나도 복구·리커널 콜백이 발화하지 않는다', async () => {
		const { handler } = makeTrackedHandler();
		stubPlaybackContainer();
		const player = fullPlayer();
		handler.armWatchdog(player);
		handler.queueAdvancer.setAdvancePending('g-1');
		handler.setLastStarted(player, track('a-enc', 'id-a'));

		await handler.handlePlayerDestroy(player);
		await vi.advanceTimersByTimeAsync(60_000);

		expect(player.node.fetchPlayer).not.toHaveBeenCalled();
		expect(playerNotifierUpdate).not.toHaveBeenCalled();
	});
});

describe('cleanup()', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetSpies();
		stubPlaybackContainer();
	});
	afterEach(afterEachCleanup);

	it('등록한 리스너 6종을 해제하고 남은 타이머를 모두 지운다', () => {
		const { handler, manager } = makeTrackedHandler();
		const player = fullPlayer();
		handler.armWatchdog(player);
		handler.queueAdvancer.setAdvancePending('g-1');
		handler.setLastStarted(player, track('a-enc', 'id-a'));
		expect(vi.getTimerCount()).toBe(3);

		handler.cleanup();

		expect(vi.getTimerCount()).toBe(0);
		for (const event of ['trackStart', 'trackEnd', 'trackStuck', 'trackError', 'queueEnd', 'playerDestroy']) {
			expect(manager.removeAllListeners).toHaveBeenCalledWith(event);
		}
	});
});

describe('watchdog 복구 루프', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetSpies();
		stubPlaybackContainer();
	});
	afterEach(afterEachCleanup);

	it('전이 확인 타이머 만료 시 서버에 트랙이 없으면 current를 다시 재생한다', async () => {
		const { handler } = makeTrackedHandler();
		const { mixer } = stubPlaybackContainer();
		const player = fullPlayer();
		player.queue.current = track('c-enc', 'id-c');

		handler.armWatchdog(player);
		await vi.advanceTimersByTimeAsync(5_000);

		expect(mixer.markUnmanaged).toHaveBeenCalledWith('g-1');
		expect(mixer.clearNext).toHaveBeenCalledWith(player);
		expect(mixer.primeForPlay).toHaveBeenCalledWith(player);
		expect(player.play).toHaveBeenCalledWith({ noReplace: true });
	});

	it('복구할 곡이 없으면 종료로 확정한다', async () => {
		const { handler } = makeTrackedHandler();
		const { notifier } = stubPlaybackContainer();
		const player = fullPlayer();

		handler.armWatchdog(player);
		await vi.advanceTimersByTimeAsync(5_000);

		expect(publishPlayerEnded).toHaveBeenCalledWith(player);
		expect(notifier.deleteController).toHaveBeenCalledWith(player);
		expect(channelSend).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(channelSend.mock.calls[0][0])).toContain('📭 대기열의 모든 곡을 재생했어요.');
	});
});
