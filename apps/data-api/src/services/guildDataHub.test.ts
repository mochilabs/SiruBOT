import { afterEach, describe, expect, it, vi } from 'vitest';
import { GuildDataPendingRequests } from './guildDataHub.ts';

const REQUEST_ID = 'c9a1e0b2-4e6f-4a3d-8c2b-1f2e3d4c5b6a';
const OTHER_REQUEST_ID = 'a1b2c3d4-e5f6-4748-a9b0-c1d2e3f4a5b6';

describe('GuildDataPendingRequests', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('fails a new request immediately without registering when the pending limit is reached', async () => {
		const registry = new GuildDataPendingRequests(1);
		const first = registry.register(REQUEST_ID, 'guild-1', 'channels', 3_000);
		expect(registry.size).toBe(1);

		// 상한 초과 — 등록되지 않고 즉시 실패해요 (대기 요청 누수 방지)
		await expect(registry.register(OTHER_REQUEST_ID, 'guild-1', 'channels', 3_000)).resolves.toEqual({ ok: false, reason: 'timeout' });
		expect(registry.size).toBe(1);

		// 첫 요청은 여전히 유효해요
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'channels', channels: [] }))).toBe('resolved');
		await expect(first).resolves.toEqual({ ok: true, channels: [] });
	});

	it('resolves pending requests as timeout when no response arrives within timeoutMs', async () => {
		vi.useFakeTimers();
		const registry = new GuildDataPendingRequests(10);
		const promise = registry.register(REQUEST_ID, 'guild-1', 'channels', 3_000);
		const assertion = expect(promise).resolves.toEqual({ ok: false, reason: 'timeout' });
		await vi.advanceTimersByTimeAsync(3_000);
		await assertion;
		// 타임아웃 뒤엔 pending에서 제거됨
		expect(registry.size).toBe(0);
	});

	it('does not time out before timeoutMs and still resolves via a matching response', async () => {
		vi.useFakeTimers();
		const registry = new GuildDataPendingRequests(10);
		const promise = registry.register(REQUEST_ID, 'guild-1', 'roles', 3_000);
		const assertion = expect(promise).resolves.toEqual({
			ok: true,
			roles: [{ id: 'r1', name: '관리자', color: 15158332, position: 5, managed: false }]
		});
		await vi.advanceTimersByTimeAsync(2_999);
		expect(
			registry.handleRaw(
				JSON.stringify({
					requestId: REQUEST_ID,
					guildId: 'guild-1',
					kind: 'roles',
					roles: [{ id: 'r1', name: '관리자', color: 15158332, position: 5, managed: false }]
				})
			)
		).toBe('resolved');
		await vi.advanceTimersByTimeAsync(500);
		await assertion;
		expect(registry.size).toBe(0);
	});

	it('leaves unexpired requests pending when the schema rejects the payload', () => {
		vi.useFakeTimers();
		const registry = new GuildDataPendingRequests(10);
		registry.register(REQUEST_ID, 'guild-1', 'channels', 3_000);

		expect(registry.handleRaw('not-json')).toBe('malformed');
		// 스키마 위반 — kind 누락
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1' }))).toBe('malformed');
		expect(registry.size).toBe(1);
	});

	it('ignores responses for unknown requestIds while keeping the pending entry', async () => {
		vi.useFakeTimers();
		const registry = new GuildDataPendingRequests(10);
		const promise = registry.register(REQUEST_ID, 'guild-1', 'channels', 3_000);

		expect(registry.handleRaw(JSON.stringify({ requestId: OTHER_REQUEST_ID, guildId: 'guild-1', kind: 'channels', channels: [] }))).toBe(
			'unmatched'
		);
		expect(registry.size).toBe(1);

		// 알 수 없는 응답이 와도 원래 요청은 타임아웃 시각을 유지해요
		const assertion = expect(promise).resolves.toEqual({ ok: false, reason: 'timeout' });
		await vi.advanceTimersByTimeAsync(3_000);
		await assertion;
	});

	it('resolves by requestId and treats later responses to the same id as unmatched', () => {
		vi.useFakeTimers();
		const registry = new GuildDataPendingRequests(10);
		const promise = registry.register(REQUEST_ID, 'guild-1', 'channels', 3_000);
		const assertion = expect(promise).resolves.toEqual({
			ok: true,
			channels: [{ id: 'c1', name: '일반', type: 0, parentId: null, position: 0 }]
		});

		expect(
			registry.handleRaw(
				JSON.stringify({
					requestId: REQUEST_ID,
					guildId: 'guild-1',
					kind: 'channels',
					channels: [{ id: 'c1', name: '일반', type: 0, parentId: null, position: 0 }]
				})
			)
		).toBe('resolved');
		// 이미 해소된 requestId — 중복 응답은 무시해요
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'channels', channels: [] }))).toBe('unmatched');
		expect(registry.size).toBe(0);
		return assertion;
	});

	it('ignores responses whose guildId or kind do not match the request', async () => {
		vi.useFakeTimers();
		const registry = new GuildDataPendingRequests(10);
		const promise = registry.register(REQUEST_ID, 'guild-1', 'channels', 3_000);

		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-2', kind: 'channels', channels: [] }))).toBe('unmatched');
		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'roles', roles: [] }))).toBe('unmatched');
		expect(registry.size).toBe(1);

		const assertion = expect(promise).resolves.toEqual({ ok: false, reason: 'timeout' });
		await vi.advanceTimersByTimeAsync(3_000);
		await assertion;
	});

	it('responses carrying error resolve as timeout instead of success', async () => {
		vi.useFakeTimers();
		const registry = new GuildDataPendingRequests(10);
		const promise = registry.register(REQUEST_ID, 'guild-1', 'roles', 3_000);
		const assertion = expect(promise).resolves.toEqual({ ok: false, reason: 'timeout' });

		expect(registry.handleRaw(JSON.stringify({ requestId: REQUEST_ID, guildId: 'guild-1', kind: 'roles', error: 'insufficient access' }))).toBe(
			'resolved'
		);
		expect(registry.size).toBe(0);
		await vi.advanceTimersByTimeAsync(3_000);
		await assertion;
	});

	it('fail() resolves a pending request immediately (publish failure path)', async () => {
		const registry = new GuildDataPendingRequests(10);
		const promise = registry.register(REQUEST_ID, 'guild-1', 'channels', 3_000);
		registry.fail(REQUEST_ID, 'redis_unavailable');
		expect(registry.size).toBe(0);
		await expect(promise).resolves.toEqual({ ok: false, reason: 'redis_unavailable' });
	});

	it('resolves a members response with member display info', async () => {
		const registry = new GuildDataPendingRequests(10);
		const promise = registry.register(REQUEST_ID, 'guild-1', 'members', 3_000);
		const assertion = expect(promise).resolves.toEqual({
			ok: true,
			members: [{ id: 'u1', displayName: '별명', username: 'account', avatarUrl: null }]
		});

		expect(
			registry.handleRaw(
				JSON.stringify({
					requestId: REQUEST_ID,
					guildId: 'guild-1',
					kind: 'members',
					members: [{ id: 'u1', displayName: '별명', username: 'account', avatarUrl: null }]
				})
			)
		).toBe('resolved');
		expect(registry.size).toBe(0);
		await assertion;
	});
});
