import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track, TrackStartEvent } from 'lavalink-client';
import { TrackHandler } from './trackHandler.ts';

const { getSubLogger } = vi.hoisted(() => ({ getSubLogger: vi.fn() }));
const stubLogger = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock('@sapphire/framework', () => ({ container: { logger: { getSubLogger } } }));

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
