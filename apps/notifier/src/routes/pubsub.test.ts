import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { SocialDispatcher } from '../services/dispatcher.ts';
import pubsubRoutes from './pubsub.ts';

const HUB_SECRET = 'websub-secret';
const CHANNEL_ID = 'UCxxxxxxxxxxxxxxxxxxxxxx';

function feedXml(): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
	<link rel="hub" href="https://pubsubhubbub.appspot.com/" />
	<title>시루 채널</title>
	<yt:channelId>${CHANNEL_ID}</yt:channelId>
	<entry>
		<title>새 영상</title>
		<link rel="alternate" href="https://www.youtube.com/watch?v=abc123" />
		<yt:videoId>abc123</yt:videoId>
		<published>2026-10-19T10:00:00.000Z</published>
		<author><name>시루</name></author>
	</entry>
</feed>`;
}

function sign(raw: string, secret = HUB_SECRET): string {
	return `sha256=${createHmac('sha256', secret).update(raw, 'utf8').digest('hex')}`;
}

async function start(options: { hubSecret?: string } = {}) {
	const dispatch = vi.fn(async () => {});
	const app = Fastify();
	// 서버(server.ts)와 같은 XML 본문 파서: WebSub 콜백은 원문이 필요해요.
	app.addContentTypeParser(['application/atom+xml', 'application/xml', 'text/xml'], { parseAs: 'string' }, (_request, body, done) =>
		done(null, body)
	);
	await pubsubRoutes(app, { dispatcher: { dispatch } as unknown as SocialDispatcher, hubSecret: options.hubSecret ?? HUB_SECRET });
	await app.ready();
	return { app, dispatch };
}

describe('pubsub routes', () => {
	const apps: FastifyInstance[] = [];

	afterEach(async () => {
		await Promise.all(apps.splice(0).map((instance) => instance.close()));
	});

	it('echoes the WebSub challenge on verification GET', async () => {
		const { app } = await start();
		apps.push(app);
		const response = await app.inject({
			method: 'GET',
			url: '/pubsub/youtube?hub.mode=subscribe&hub.challenge=challenge-1&hub.lease_seconds=86400'
		});
		expect(response.statusCode).toBe(200);
		expect(response.body).toBe('challenge-1');
	});

	it('answers 400 when the challenge is missing', async () => {
		const { app } = await start();
		apps.push(app);
		const response = await app.inject({ method: 'GET', url: '/pubsub/youtube' });
		expect(response.statusCode).toBe(400);
	});

	it('rejects callbacks with a bad HMAC signature', async () => {
		const { app, dispatch } = await start();
		apps.push(app);
		const response = await app.inject({
			method: 'POST',
			url: '/pubsub/youtube',
			payload: feedXml(),
			headers: { 'content-type': 'application/atom+xml', 'x-hub-signature': 'sha256=deadbeef' }
		});
		expect(response.statusCode).toBe(403);
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('answers 403 when the push endpoint is disabled (no hub secret)', async () => {
		const { app } = await start({ hubSecret: '' });
		apps.push(app);
		const raw = feedXml();
		const response = await app.inject({
			method: 'POST',
			url: '/pubsub/youtube',
			payload: raw,
			headers: { 'content-type': 'application/atom+xml', 'x-hub-signature': sign(raw) }
		});
		expect(response.statusCode).toBe(403);
	});

	it('answers 200 quickly and dispatches entries for a valid signature', async () => {
		const { app, dispatch } = await start();
		apps.push(app);
		const raw = feedXml();
		const response = await app.inject({
			method: 'POST',
			url: '/pubsub/youtube',
			payload: raw,
			headers: { 'content-type': 'application/atom+xml', 'x-hub-signature': sign(raw) }
		});
		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ ok: true });
		await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
		expect((dispatch.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({
			platform: 'youtube',
			contentId: 'abc123',
			sourceId: CHANNEL_ID
		});
	});
});
