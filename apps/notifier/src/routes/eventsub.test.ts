import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { SocialDispatcher } from '../services/dispatcher.ts';
import { eventsubRoutes } from './eventsub.ts';

const SECRET = 'eventsub-secret';
const MESSAGE_ID = 'msg-00000000-0000-4000-8000-000000000001';

function sign(raw: string, timestamp: string, secret = SECRET): string {
	return `sha256=${createHmac('sha256', secret)
		.update(MESSAGE_ID + timestamp + raw)
		.digest('hex')}`;
}

function buildApp(options: { secret?: string; dispatch?: ReturnType<typeof vi.fn> } = {}) {
	const dispatch = options.dispatch ?? vi.fn(async () => {});
	const app = Fastify();
	return {
		app,
		dispatch,
		ready: eventsubRoutes(app, { dispatcher: { dispatch } as unknown as SocialDispatcher, secret: options.secret ?? SECRET }).then(() =>
			app.ready()
		)
	};
}

function post(app: FastifyInstance, raw: string, headers: Record<string, string>) {
	return app.inject({ method: 'POST', url: '/eventsub/twitch', payload: raw, headers: { 'content-type': 'application/json', ...headers } });
}

function baseHeaders(raw: string, extra: Record<string, string> = {}) {
	const timestamp = new Date().toISOString();
	return {
		'twitch-eventsub-message-id': MESSAGE_ID,
		'twitch-eventsub-message-timestamp': timestamp,
		'twitch-eventsub-message-signature': sign(raw, timestamp),
		'twitch-eventsub-message-type': 'notification',
		...extra
	};
}

describe('eventsub routes', () => {
	const apps: FastifyInstance[] = [];

	afterEach(async () => {
		await Promise.all(apps.splice(0).map((instance) => instance.close()));
	});

	async function start(options?: Parameters<typeof buildApp>[0]) {
		const built = buildApp(options);
		await built.ready;
		apps.push(built.app);
		return built;
	}

	it('echoes the challenge for webhook_callback_verification', async () => {
		const { app } = await start();
		const raw = JSON.stringify({ challenge: 'challenge-token', subscription: { type: 'stream.online' } });
		const response = await post(app, raw, baseHeaders(raw, { 'twitch-eventsub-message-type': 'webhook_callback_verification' }));
		expect(response.statusCode).toBe(200);
		expect(response.body).toBe('challenge-token');
	});

	it('rejects unsigned or stale messages before any parsing', async () => {
		const { app, dispatch } = await start();
		const raw = JSON.stringify({ challenge: 'x' });

		const missing = await post(app, raw, {});
		expect(missing.statusCode).toBe(400);

		const staleTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();
		const stale = await post(app, raw, {
			'twitch-eventsub-message-id': MESSAGE_ID,
			'twitch-eventsub-message-timestamp': staleTimestamp,
			'twitch-eventsub-message-signature': sign(raw, staleTimestamp),
			'twitch-eventsub-message-type': 'notification'
		});
		expect(stale.statusCode).toBe(403);

		const tampered = await post(app, raw, baseHeaders(raw, { 'twitch-eventsub-message-signature': 'sha256=deadbeef' }));
		expect(tampered.statusCode).toBe(403);
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('answers 403 when the push endpoint is disabled (no secret)', async () => {
		const { app } = await start({ secret: '' });
		const raw = JSON.stringify({ challenge: 'x' });
		const timestamp = new Date().toISOString();
		const response = await post(app, raw, {
			'twitch-eventsub-message-id': MESSAGE_ID,
			'twitch-eventsub-message-timestamp': timestamp,
			'twitch-eventsub-message-signature': sign(raw, timestamp, ''),
			'twitch-eventsub-message-type': 'notification'
		});
		expect(response.statusCode).toBe(403);
	});

	it('dispatches a complete stream.online notification', async () => {
		const { app, dispatch } = await start();
		const raw = JSON.stringify({
			subscription: { type: 'stream.online', status: 'enabled' },
			event: {
				id: 'stream-1',
				broadcaster_user_id: '999888777',
				broadcaster_user_login: 'siru',
				broadcaster_user_name: '시루',
				started_at: new Date().toISOString()
			}
		});
		const response = await post(app, raw, baseHeaders(raw));
		expect(response.statusCode).toBe(200);
		await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
		expect((dispatch.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({
			platform: 'twitch',
			sourceId: '999888777',
			url: 'https://www.twitch.tv/siru'
		});
	});

	it('skips dispatch for incomplete stream.online events but still answers 200', async () => {
		const { app, dispatch } = await start();
		const raw = JSON.stringify({ subscription: { type: 'stream.online' }, event: { id: 'stream-1' } });
		const response = await post(app, raw, baseHeaders(raw));
		expect(response.statusCode).toBe(200);
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('answers 200 for revocation and unknown message types', async () => {
		const { app } = await start();
		const revoked = JSON.stringify({ subscription: { type: 'stream.online' } });
		const response = await post(app, revoked, baseHeaders(revoked, { 'twitch-eventsub-message-type': 'revocation' }));
		expect(response.statusCode).toBe(200);
	});
});
