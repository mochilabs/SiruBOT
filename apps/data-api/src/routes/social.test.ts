import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerSocialRoutes } from './social.ts';

async function buildApp(deps: { notifierUrl?: string; notifierAuthKey?: string }) {
	const fastify = Fastify({ logger: false });
	await registerSocialRoutes(fastify, deps);
	return fastify;
}

describe('social proxy routes', () => {
	it('notifier 주소가 없으면 503으로 안내한다', async () => {
		const fastify = await buildApp({});
		const response = await fastify.inject({ method: 'GET', url: '/v1/guilds/123456789012345678/social/subscriptions' });

		expect(response.statusCode).toBe(503);
		expect(response.json()).toEqual({ error: 'notifier_not_configured', message: '알림 서버 주소가 설정되지 않았어요.' });
		await fastify.close();
	});

	it('notifier 연결 실패는 502로 매핑한다', async () => {
		const fastify = await buildApp({ notifierUrl: 'http://127.0.0.1:1' });
		const response = await fastify.inject({ method: 'GET', url: '/v1/guilds/123456789012345678/social/subscriptions' });

		expect(response.statusCode).toBe(502);
		expect(response.json()).toEqual({ error: 'notifier_unreachable', message: '알림 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' });
		await fastify.close();
	});

	it('길드 ID 형식이 틀리면 400 invalid_params로 응답한다', async () => {
		const fastify = await buildApp({});
		const response = await fastify.inject({ method: 'GET', url: '/v1/guilds/bad!id/social/subscriptions' });

		expect(response.statusCode).toBe(400);
		expect(response.json()).toEqual({ error: 'invalid_params', message: '길드 ID 형식이 올바르지 않아요.' });
		await fastify.close();
	});

	it('구독 ID가 UUID가 아니면 400 invalid_params로 응답한다', async () => {
		const fastify = await buildApp({});
		const response = await fastify.inject({ method: 'PATCH', url: '/v1/guilds/123456789012345678/social/subscriptions/not-a-uuid' });

		expect(response.statusCode).toBe(400);
		expect(response.json()).toEqual({ error: 'invalid_params', message: '구독 ID 형식이 올바르지 않아요.' });
		await fastify.close();
	});
});
