import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerWebPendingRequests } from './playerWebHub.ts';

const REQUEST_ID = 'c8e2f5a9-4b1d-4e7f-9c3a-6d8b0e2f4a51';
const OTHER_REQUEST_ID = 'a1d4e7b2-5c8f-4a1d-8e3b-7f0c2d5a8e41';

const VOICE_CONTEXT = { inVoice: true, voiceChannelName: '음악 채널', canControl: true };
const TRACK = {
	title: 'Never Gonna Give You Up',
	author: 'Rick Astley',
	durationMs: 213_000,
	artworkUrl: null,
	uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	sourceName: 'youtube',
	isStream: false
};

describe('PlayerWebPendingRequests', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('fails a new request immediately without registering when the pending limit is reached', async () => {
		const registry = new PlayerWebPendingRequests(1);
		const first = registry.register(REQUEST_ID, 'guild-1', 'search', 10_000);
		expect(registry.size).toBe(1);

		// 상한 초과 — 등록되지 않고 즉시 실패해요 (대기 요청 누수 방지)
		await expect(registry.register(OTHER_REQUEST_ID, 'guild-1', 'search', 10_000)).resolves.toEqual({
			ok: false,
			reason: 'timeout',
			message: null
		});
		expect(registry.size).toBe(1);

		// 첫 요청은 여전히 유효해요
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'search', tracks: [TRACK] }))).toBe('resolved');
		await expect(first).resolves.toEqual({ ok: true, tracks: [TRACK] });
	});

	it('resolves pending requests as timeout when no response arrives within timeoutMs', async () => {
		vi.useFakeTimers();
		const registry = new PlayerWebPendingRequests(10);
		const promise = registry.register(REQUEST_ID, 'guild-1', 'play', 12_000);
		const assertion = expect(promise).resolves.toEqual({ ok: false, reason: 'timeout', message: null });
		await vi.advanceTimersByTimeAsync(12_000);
		await assertion;
		// 타임아웃 뒤엔 pending에서 제거됨
		expect(registry.size).toBe(0);
	});

	it('resolves a matching search response before timeoutMs', async () => {
		vi.useFakeTimers();
		const registry = new PlayerWebPendingRequests(10);
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
		const registry = new PlayerWebPendingRequests(10);
		const promise = registry.register(REQUEST_ID, 'guild-1', 'voice-context', 4_000);
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'voice-context', voice: VOICE_CONTEXT }))).toBe(
			'resolved'
		);
		await expect(promise).resolves.toEqual({ ok: true, voice: VOICE_CONTEXT });
	});

	it('resolves a control response without payload fields', async () => {
		const registry = new PlayerWebPendingRequests(10);
		const promise = registry.register(REQUEST_ID, 'guild-1', 'control', 6_000);
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'control' }))).toBe('resolved');
		await expect(promise).resolves.toEqual({ ok: true, tracks: undefined, voice: undefined });
	});

	it('carries the bot error message back as a bot_error failure', async () => {
		vi.useFakeTimers();
		const registry = new PlayerWebPendingRequests(10);
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
		const registry = new PlayerWebPendingRequests(10);
		registry.register(REQUEST_ID, 'guild-1', 'search', 10_000);

		expect(registry.handleRaw('not-json')).toBe('malformed');
		// 스키마 위반 — kind 누락
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1' }))).toBe('malformed');
		expect(registry.size).toBe(1);
	});

	it('ignores responses whose guildId or kind do not match the request', async () => {
		vi.useFakeTimers();
		const registry = new PlayerWebPendingRequests(10);
		const promise = registry.register(REQUEST_ID, 'guild-1', 'search', 10_000);

		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-2', kind: 'search', tracks: [] }))).toBe('unmatched');
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'play' }))).toBe('unmatched');
		expect(registry.size).toBe(1);

		const assertion = expect(promise).resolves.toEqual({ ok: false, reason: 'timeout', message: null });
		await vi.advanceTimersByTimeAsync(10_000);
		await assertion;
	});

	it('resolves by requestId and treats later responses to the same id as unmatched', async () => {
		const registry = new PlayerWebPendingRequests(10);
		const promise = registry.register(REQUEST_ID, 'guild-1', 'voice-context', 4_000);
		const assertion = expect(promise).resolves.toEqual({ ok: true, voice: VOICE_CONTEXT });

		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'voice-context', voice: VOICE_CONTEXT }))).toBe(
			'resolved'
		);
		// 이미 해소된 requestId — 중복 응답은 무시해요
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'voice-context', voice: VOICE_CONTEXT }))).toBe(
			'unmatched'
		);
		expect(registry.size).toBe(0);
		await assertion;
	});

	it('fail() resolves a pending request immediately (publish failure path)', async () => {
		const registry = new PlayerWebPendingRequests(10);
		const promise = registry.register(REQUEST_ID, 'guild-1', 'search', 10_000);
		registry.fail(REQUEST_ID, 'redis_unavailable');
		expect(registry.size).toBe(0);
		await expect(promise).resolves.toEqual({ ok: false, reason: 'redis_unavailable', message: null });
	});
});
