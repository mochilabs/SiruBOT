import { afterEach, describe, expect, it, vi } from 'vitest';
import { JtcSetupPendingRequests } from './jtcSetupHub.ts';

const REQUEST_ID = 'c9d3a1b2-4e5f-4a6b-8c7d-2b1e3f4a5c61';
const OTHER_REQUEST_ID = 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c51';
const GUILD_ID = '123456789012345678';

describe('JtcSetupPendingRequests', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('fails a new request immediately without registering when the pending limit is reached', async () => {
		const registry = new JtcSetupPendingRequests(1);
		const first = registry.register(REQUEST_ID, GUILD_ID, 10_000);
		expect(registry.size).toBe(1);

		// 상한 초과 — 등록되지 않고 즉시 실패해요 (대기 요청 누수 방지)
		await expect(registry.register(OTHER_REQUEST_ID, GUILD_ID, 10_000)).resolves.toEqual({
			ok: false,
			reason: 'timeout',
			message: null
		});
		expect(registry.size).toBe(1);

		// 첫 요청은 여전히 유효해요
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: GUILD_ID, markerChannelId: '0192837465f1' }))).toBe('resolved');
		await expect(first).resolves.toEqual({ ok: true, markerChannelId: '0192837465f1' });
	});

	it('resolves pending requests as timeout when no response arrives within timeoutMs', async () => {
		vi.useFakeTimers();
		const registry = new JtcSetupPendingRequests(10);
		const promise = registry.register(REQUEST_ID, GUILD_ID, 10_000);
		const assertion = expect(promise).resolves.toEqual({ ok: false, reason: 'timeout', message: null });
		await vi.advanceTimersByTimeAsync(10_000);
		await assertion;
		// 타임아웃 뒤엔 pending에서 제거됨
		expect(registry.size).toBe(0);
	});

	it('resolves a matching response with the marker channel id before timeoutMs', async () => {
		vi.useFakeTimers();
		const registry = new JtcSetupPendingRequests(10);
		const promise = registry.register(REQUEST_ID, GUILD_ID, 10_000);
		const assertion = expect(promise).resolves.toEqual({ ok: true, markerChannelId: '0192837465f1e2d3c4' });

		await vi.advanceTimersByTimeAsync(1_000);
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: GUILD_ID, markerChannelId: '0192837465f1e2d3c4' }))).toBe(
			'resolved'
		);
		expect(registry.size).toBe(0);
		await vi.advanceTimersByTimeAsync(500);
		await assertion;
	});

	it('carries the bot error message back as a bot_error failure', async () => {
		vi.useFakeTimers();
		const registry = new JtcSetupPendingRequests(10);
		const promise = registry.register(REQUEST_ID, GUILD_ID, 10_000);
		const assertion = expect(promise).resolves.toEqual({ ok: false, reason: 'bot_error', message: '카테고리 채널만 선택할 수 있어요.' });

		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: GUILD_ID, error: '카테고리 채널만 선택할 수 있어요.' }))).toBe(
			'resolved'
		);
		expect(registry.size).toBe(0);
		await assertion;
	});

	it('leaves unexpired requests pending when the schema rejects the payload', () => {
		const registry = new JtcSetupPendingRequests(10);
		registry.register(REQUEST_ID, GUILD_ID, 10_000);

		expect(registry.handleRaw('not-json')).toBe('malformed');
		// 스키마 위반 — requestId 누락
		expect(registry.handleRaw(JSON.stringify({ guildId: GUILD_ID, markerChannelId: '0192837465f1' }))).toBe('malformed');
		expect(registry.size).toBe(1);
	});

	it('ignores responses whose guildId does not match the request', async () => {
		vi.useFakeTimers();
		const registry = new JtcSetupPendingRequests(10);
		const promise = registry.register(REQUEST_ID, GUILD_ID, 10_000);

		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: '999999999999999999', markerChannelId: 'x' }))).toBe('unmatched');
		expect(registry.size).toBe(1);

		const assertion = expect(promise).resolves.toEqual({ ok: false, reason: 'timeout', message: null });
		await vi.advanceTimersByTimeAsync(10_000);
		await assertion;
	});

	it('resolves by requestId and treats later responses to the same id as unmatched', async () => {
		const registry = new JtcSetupPendingRequests(10);
		const promise = registry.register(REQUEST_ID, GUILD_ID, 10_000);
		const assertion = expect(promise).resolves.toEqual({ ok: true, markerChannelId: '0192837465f1' });

		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: GUILD_ID, markerChannelId: '0192837465f1' }))).toBe('resolved');
		// 이미 해소된 requestId — 중복 응답은 무시해요
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: GUILD_ID, markerChannelId: '0192837465f1' }))).toBe('unmatched');
		expect(registry.size).toBe(0);
		await assertion;
	});

	it('fail() resolves a pending request immediately (publish failure path)', async () => {
		const registry = new JtcSetupPendingRequests(10);
		const promise = registry.register(REQUEST_ID, GUILD_ID, 10_000);
		registry.fail(REQUEST_ID, 'redis_unavailable');
		expect(registry.size).toBe(0);
		await expect(promise).resolves.toEqual({ ok: false, reason: 'redis_unavailable', message: null });
	});
});
