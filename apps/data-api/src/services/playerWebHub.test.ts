import { afterEach, describe, expect, it, vi } from 'vitest';
import { PendingRequestPool, type PlayerWebKind } from '@sirubot/utils';
import { hub, type PlayerWebFailureReason, type PlayerWebPendingMeta, type PlayerWebResult } from './playerWebHub.ts';

const REQUEST_ID = 'c8e2f5a9-4b1d-4e7f-9c3a-6d8b0e2f4a51';
const OTHER_REQUEST_ID = 'a1d4e7b2-5c8f-4a1d-8e3b-7f0c2d5a8e41';

const VOICE_CONTEXT = { inVoice: true, voiceChannelName: '음악 채널', canControl: true, canPlay: true };
const TRACK = {
	title: 'Never Gonna Give You Up',
	author: 'Rick Astley',
	durationMs: 213_000,
	artworkUrl: null,
	uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	sourceName: 'youtube',
	isStream: false
};

function makeRegistry(capacity = 10) {
	const pendingMeta = new Map<string, PlayerWebPendingMeta>();
	const pending = new PendingRequestPool<PlayerWebResult>({
		capacity,
		timeoutResult: () => ({ ok: false, reason: 'timeout', message: null }),
		onTimeout: (requestId) => pendingMeta.delete(requestId)
	});
	return {
		get size() {
			return pending.size;
		},
		register(requestId: string, guildId: string, kind: PlayerWebKind, timeoutMs: number) {
			pendingMeta.set(requestId, { guildId, kind });
			return pending.register(requestId, timeoutMs);
		},
		handleRaw(raw: string) {
			return hub.correlate(raw, pending, pendingMeta);
		},
		fail(requestId: string, reason: PlayerWebFailureReason) {
			if (pending.fail(requestId, { ok: false, reason, message: null })) {
				pendingMeta.delete(requestId);
			}
		}
	};
}

describe('playerWebHub pending correlation', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('fails a new request immediately without registering when the pending limit is reached', async () => {
		const registry = makeRegistry(1);
		const first = registry.register(REQUEST_ID, 'guild-1', 'search', 10_000);
		expect(registry.size).toBe(1);

		await expect(registry.register(OTHER_REQUEST_ID, 'guild-1', 'search', 10_000)).resolves.toEqual({
			ok: false,
			reason: 'timeout',
			message: null
		});
		expect(registry.size).toBe(1);

		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'search', tracks: [TRACK] }))).toBe('resolved');
		await expect(first).resolves.toEqual({ ok: true, tracks: [TRACK] });
	});

	it('resolves pending requests as timeout when no response arrives within timeoutMs', async () => {
		vi.useFakeTimers();
		const registry = makeRegistry();
		const promise = registry.register(REQUEST_ID, 'guild-1', 'play', 12_000);
		const assertion = expect(promise).resolves.toEqual({ ok: false, reason: 'timeout', message: null });
		await vi.advanceTimersByTimeAsync(12_000);
		await assertion;
		expect(registry.size).toBe(0);
	});

	it('resolves a matching search response before timeoutMs', async () => {
		vi.useFakeTimers();
		const registry = makeRegistry();
		const promise = registry.register(REQUEST_ID, 'guild-1', 'search', 10_000);
		const assertion = expect(promise).resolves.toEqual({ ok: true, tracks: [TRACK, TRACK] });

		await vi.advanceTimersByTimeAsync(1_000);
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'search', tracks: [TRACK, TRACK] }))).toBe(
			'resolved'
		);
		expect(registry.size).toBe(0);
		await vi.advanceTimersByTimeAsync(500);
		await assertion;
	});

	it('resolves a voice-context response with the voice payload', async () => {
		const registry = makeRegistry();
		const promise = registry.register(REQUEST_ID, 'guild-1', 'voice-context', 4_000);
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'voice-context', voice: VOICE_CONTEXT }))).toBe(
			'resolved'
		);
		await expect(promise).resolves.toEqual({ ok: true, voice: VOICE_CONTEXT });
	});

	it('resolves a control response without payload fields', async () => {
		const registry = makeRegistry();
		const promise = registry.register(REQUEST_ID, 'guild-1', 'control', 6_000);
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'control' }))).toBe('resolved');
		await expect(promise).resolves.toEqual({ ok: true, tracks: undefined, voice: undefined });
	});

	it('carries the bot error code back so callers need not compare messages', async () => {
		vi.useFakeTimers();
		const registry = makeRegistry();
		const promise = registry.register(REQUEST_ID, 'guild-1', 'search', 12_000);
		const assertion = expect(promise).resolves.toEqual({ ok: false, reason: 'bot_error', message: '검색 결과가 없어요.', code: 'search_empty' });
		expect(
			registry.handleRaw(
				JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'search', error: '검색 결과가 없어요.', code: 'search_empty' })
			)
		).toBe('resolved');
		await assertion;
	});

	it('carries the bot error message back as a bot_error failure', async () => {
		vi.useFakeTimers();
		const registry = makeRegistry();
		const promise = registry.register(REQUEST_ID, 'guild-1', 'play', 12_000);
		const assertion = expect(promise).resolves.toEqual({ ok: false, reason: 'bot_error', message: '🎧 음성 채널에 먼저 접속해 주세요.' });

		expect(
			registry.handleRaw(
				JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'play', error: '🎧 음성 채널에 먼저 접속해 주세요.' })
			)
		).toBe('resolved');
		expect(registry.size).toBe(0);
		await assertion;
	});

	it('leaves unexpired requests pending when the schema rejects the payload', () => {
		const registry = makeRegistry();
		registry.register(REQUEST_ID, 'guild-1', 'search', 10_000);

		expect(registry.handleRaw('not-json')).toBe('malformed');
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1' }))).toBe('malformed');
		expect(registry.size).toBe(1);
	});

	it('ignores responses whose guildId or kind do not match the request', async () => {
		vi.useFakeTimers();
		const registry = makeRegistry();
		const promise = registry.register(REQUEST_ID, 'guild-1', 'search', 10_000);

		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-2', kind: 'search', tracks: [] }))).toBe('unmatched');
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'play' }))).toBe('unmatched');
		expect(registry.size).toBe(1);

		const assertion = expect(promise).resolves.toEqual({ ok: false, reason: 'timeout', message: null });
		await vi.advanceTimersByTimeAsync(10_000);
		await assertion;
	});

	it('resolves by requestId and treats later responses to the same id as unmatched', async () => {
		const registry = makeRegistry();
		const promise = registry.register(REQUEST_ID, 'guild-1', 'voice-context', 4_000);
		const assertion = expect(promise).resolves.toEqual({ ok: true, voice: VOICE_CONTEXT });

		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'voice-context', voice: VOICE_CONTEXT }))).toBe(
			'resolved'
		);
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'voice-context', voice: VOICE_CONTEXT }))).toBe(
			'unmatched'
		);
		expect(registry.size).toBe(0);
		await assertion;
	});

	it('fail() resolves a pending request immediately (publish failure path)', async () => {
		const registry = makeRegistry();
		const promise = registry.register(REQUEST_ID, 'guild-1', 'search', 10_000);
		registry.fail(REQUEST_ID, 'redis_unavailable');
		expect(registry.size).toBe(0);
		await expect(promise).resolves.toEqual({ ok: false, reason: 'redis_unavailable', message: null });
	});
});
