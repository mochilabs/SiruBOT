import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { container } from '@sapphire/framework';
import type { Track, TrackStartEvent } from 'lavalink-client';
import { TrackHandler } from './trackHandler.ts';

const { getSubLogger, reportPlaybackEvent, playerNotifierUpdate, mixerService } = vi.hoisted(() => ({
	getSubLogger: vi.fn(),
	reportPlaybackEvent: vi.fn(),
	playerNotifierUpdate: vi.fn(),
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

function makeHandler() {
	const buildTrack = vi.fn((payload: { encoded: string; info?: Record<string, unknown> }) => ({
		encoded: payload.encoded,
		info: payload.info ?? {},
		requester: undefined
	}));
	const manager = { on: vi.fn(), utils: { buildTrack }, removeAllListeners: vi.fn() };
	const handler = new TrackHandler(manager as never);
	return { handler: handler as unknown as { [key: string]: any }, buildTrack };
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
		const resolved = handler.resolveStartedTrack(player, clientTrack, startEvent(), null);
		expect(resolved).toBe(clientTrack);
		expect(buildTrack).not.toHaveBeenCalled();
	});

	it('keeps the client track when the payload encoded id matches it', () => {
		const { handler } = makeHandler();
		const clientTrack = track('same-enc', 'id-a');
		const player = { guildId: 'g', queue: { tracks: [] } };
		expect(handler.resolveStartedTrack(player, clientTrack, startEvent('same-enc', 'id-a'), null)).toBe(clientTrack);
	});

	it('prefers the client track when identifiers match even though encoded ids differ (stale server metadata)', () => {
		const { handler, buildTrack } = makeHandler();
		const clientTrack = track('client-enc', 'id-a');
		const player = { guildId: 'g', queue: { tracks: [] } };
		expect(handler.resolveStartedTrack(player, clientTrack, startEvent('server-enc', 'id-a'), null)).toBe(clientTrack);
		expect(buildTrack).not.toHaveBeenCalled();
	});

	it('resolves to the queued track object when the payload identifier matches a queued track', () => {
		const { handler, buildTrack } = makeHandler();
		const clientTrack = track('client-enc', 'id-a');
		const queued = track('queued-enc', 'id-b');
		const player = { guildId: 'g', queue: { tracks: [queued] } };
		const resolved = handler.resolveStartedTrack(player, clientTrack, startEvent('server-enc', 'id-b'), null);
		expect(resolved).toBe(queued);
		expect(buildTrack).not.toHaveBeenCalled();
	});

	it('falls back to the server payload track when nothing matches', () => {
		const { handler, buildTrack } = makeHandler();
		const clientTrack = track('client-enc', 'id-a');
		const player = { guildId: 'g', queue: { tracks: [] } };
		const resolved = handler.resolveStartedTrack(player, clientTrack, startEvent('server-enc', 'id-z'), null);
		expect(buildTrack).toHaveBeenCalledWith(expect.objectContaining({ encoded: 'server-enc' }), undefined);
		expect(resolved).toEqual(expect.objectContaining({ encoded: 'server-enc' }));
	});

	it('warns when the started track is neither the preloaded one nor a known queue entry', () => {
		const { handler } = makeHandler();
		const clientTrack = track('client-enc', 'id-a');
		const player = { guildId: 'g', queue: { tracks: [] } };
		handler.resolveStartedTrack(player, clientTrack, startEvent('server-enc', 'id-z'), 'preloaded-id');
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

		await handler.reconcileNowPlaying(player, started, 'started-enc');

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

		await handler.reconcileNowPlaying(player, started, 'started-enc');

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

		await handler.reconcileNowPlaying(player, started, 'started-enc');

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

		await handler.reconcileNowPlaying(player, started, 'started-enc');

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
		const resolved = handler.resolveStartedTrack(player, clientTrack, startEvent('server-enc', 'id-z'), null);
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
});
