import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { isEventSubTimestampFresh, TwitchApiClient, verifyEventSubSignature, type TwitchFetchFn } from './twitchApi.ts';

const SECRET = 'eventsub-secret-20-chars-min';

describe('verifyEventSubSignature', () => {
	it('accepts a valid signature over id, timestamp and body', () => {
		const messageId = 'msg-1';
		const timestamp = '2026-10-19T10:00:00.000Z';
		const rawBody = '{"subscription":{"id":"sub-1"}}';
		const signature = `sha256=${createHmac('sha256', SECRET)
			.update(messageId + timestamp + rawBody)
			.digest('hex')}`;
		expect(verifyEventSubSignature(rawBody, messageId, timestamp, signature, SECRET)).toBe(true);
	});

	it('rejects forged and malformed signatures', () => {
		const messageId = 'msg-1';
		const timestamp = '2026-10-19T10:00:00.000Z';
		const rawBody = '{"subscription":{"id":"sub-1"}}';
		const wrong = `sha256=${createHmac('sha256', '다른 시크릿')
			.update(messageId + timestamp + rawBody)
			.digest('hex')}`;
		expect(verifyEventSubSignature(rawBody, messageId, timestamp, wrong, SECRET)).toBe(false);
		expect(verifyEventSubSignature(rawBody, messageId, timestamp, 'sha256=deadbeef', SECRET)).toBe(false);
		expect(verifyEventSubSignature(rawBody, messageId, timestamp, '', SECRET)).toBe(false);
	});
});

describe('isEventSubTimestampFresh', () => {
	const NOW = 1_700_000_000_000;

	it('accepts timestamps within the 10 minute window', () => {
		expect(isEventSubTimestampFresh(new Date(NOW - 5 * 60 * 1000).toISOString(), NOW)).toBe(true);
		expect(isEventSubTimestampFresh(new Date(NOW + 5 * 60 * 1000).toISOString(), NOW)).toBe(true);
	});

	it('rejects stale and invalid timestamps', () => {
		expect(isEventSubTimestampFresh(new Date(NOW - 11 * 60 * 1000).toISOString(), NOW)).toBe(false);
		expect(isEventSubTimestampFresh('not-a-date', NOW)).toBe(false);
	});
});

describe('TwitchApiClient', () => {
	function tokenResponse(): Response {
		return new Response(JSON.stringify({ access_token: 'app-token', expires_in: 3600, token_type: 'bearer' }), { status: 200 });
	}

	it('resolves a user by login through an app token', async () => {
		const fetchFn: TwitchFetchFn = vi.fn(async (url: string) => {
			if (url.startsWith('https://id.twitch.tv')) return tokenResponse();
			return new Response(JSON.stringify({ data: [{ id: '111', login: 'siru', display_name: '시루' }] }), { status: 200 });
		});
		const client = new TwitchApiClient({ clientId: 'cid', clientSecret: 'cs', fetchFn });
		const user = await client.getTwitchUser('siru');
		expect(user).toEqual({ id: '111', login: 'siru', displayName: '시루' });
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it('returns null when the user does not exist', async () => {
		const fetchFn: TwitchFetchFn = vi.fn(async (url: string) => {
			if (url.startsWith('https://id.twitch.tv')) return tokenResponse();
			return new Response(JSON.stringify({ data: [] }), { status: 200 });
		});
		const client = new TwitchApiClient({ clientId: 'cid', clientSecret: 'cs', fetchFn });
		expect(await client.getTwitchUser('ghost')).toBeNull();
	});

	it('re-issues the token once after a 401 and retries', async () => {
		let usersCallCount = 0;
		const fetchFn: TwitchFetchFn = vi.fn(async (url: string) => {
			if (url.startsWith('https://id.twitch.tv')) return tokenResponse();
			usersCallCount++;
			if (usersCallCount === 1) return new Response('', { status: 401 });
			return new Response(JSON.stringify({ data: [{ id: '111', login: 'siru', display_name: '시루' }] }), { status: 200 });
		});
		const client = new TwitchApiClient({ clientId: 'cid', clientSecret: 'cs', fetchFn });
		const user = await client.getTwitchUser('siru');
		expect(user).toEqual({ id: '111', login: 'siru', displayName: '시루' });
		// token + users(401) + token(재발급) + users(200)
		expect(fetchFn).toHaveBeenCalledTimes(4);
	});

	it('creates a stream.online subscription and returns its id', async () => {
		const fetchFn: TwitchFetchFn = vi.fn(async (url: string) => {
			if (url.startsWith('https://id.twitch.tv')) return tokenResponse();
			return new Response(JSON.stringify({ data: [{ id: 'sub-1' }] }), { status: 202 });
		});
		const client = new TwitchApiClient({ clientId: 'cid', clientSecret: 'cs', fetchFn });
		const created = await client.createStreamOnlineSubscription({
			broadcasterUserId: '111',
			callbackUrl: 'https://example.com/eventsub/twitch',
			secret: SECRET
		});
		expect(created).toEqual({ subscriptionId: 'sub-1' });
	});

	it('throws when subscription creation is rejected', async () => {
		const fetchFn: TwitchFetchFn = vi.fn(async (url: string) => {
			if (url.startsWith('https://id.twitch.tv')) return tokenResponse();
			return new Response('{"error":"Conflict"}', { status: 409 });
		});
		const client = new TwitchApiClient({ clientId: 'cid', clientSecret: 'cs', fetchFn });
		await expect(
			client.createStreamOnlineSubscription({ broadcasterUserId: '111', callbackUrl: 'https://example.com/eventsub/twitch', secret: SECRET })
		).rejects.toThrow('HTTP 409');
	});

	it('treats delete as success on 204 and 404', async () => {
		let deleteCount = 0;
		const fetchFn: TwitchFetchFn = vi.fn(async (url: string) => {
			if (url.startsWith('https://id.twitch.tv')) return tokenResponse();
			deleteCount++;
			return new Response(null, { status: deleteCount === 1 ? 204 : 404 });
		});
		const client = new TwitchApiClient({ clientId: 'cid', clientSecret: 'cs', fetchFn });
		expect(await client.deleteSubscription('sub-1')).toBe(true);
		expect(await client.deleteSubscription('sub-1')).toBe(true);
	});
});
