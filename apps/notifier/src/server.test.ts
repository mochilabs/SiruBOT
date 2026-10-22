import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@sirubot/prisma';
import type { Env } from './config/env.ts';
import { buildServer } from './server.ts';
import type { SocialDispatcher } from './services/dispatcher.ts';
import type { SocialWebhookHub } from './services/webhookHub.ts';
import type { NotifierRedis } from './services/redis.ts';

// 공용 에러 계약 스모크 — buildServer가 등록한 errorHandler·auth 401·notFound shape를 잠가요.

const ENV = {
	PORT: 0,
	notifierAuthKey: 'contract-key',
	chzzkPollingEnabled: false
} as unknown as Env;

function stubServices() {
	return {
		dispatcher: { dispatch: vi.fn(async () => undefined) } as unknown as SocialDispatcher,
		getDb: () => null as PrismaClient | null,
		hub: { requestWebhookCreate: vi.fn(async () => ({ requestId: 'r', guildId: 'g' })) } as unknown as SocialWebhookHub,
		twitchClient: null,
		redis: { get: vi.fn(async () => null), del: vi.fn(async () => undefined) } as unknown as NotifierRedis
	};
}

let apps: FastifyInstance[] = [];

afterEach(async () => {
	await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function build(): Promise<FastifyInstance> {
	const { fastify } = await buildServer(ENV, stubServices());
	apps.push(fastify);
	return fastify;
}

describe('notifier error contract', () => {
	it('헬스는 인증 없이 200이에요', async () => {
		const app = await build();
		const res = await app.inject({ method: 'GET', url: '/health' });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ ok: true });
	});

	it('보호 라우트 401은 { error } 한국어 문구 shape예요', async () => {
		const app = await build();
		const res = await app.inject({ method: 'GET', url: `/v1/guilds/100000000000000001/social/subscriptions` });
		expect(res.statusCode).toBe(401);
		expect(res.json()).toEqual({ error: '인증 정보가 없어요.' });
	});

	it('라우트 미존재 404는 공용 not_found shape예요 (Fastify 기본 shape 아님)', async () => {
		const app = await build();
		const res = await app.inject({ method: 'GET', url: '/v1/unknown' });
		expect(res.statusCode).toBe(404);
		expect(res.json()).toEqual({ error: 'not_found', message: '요청한 리소스를 찾을 수 없어요.' });
	});

	it('JSON 본문 파싱 실패는 400 invalid_params shape예요', async () => {
		const app = await build();
		const res = await app.inject({
			method: 'POST',
			url: '/v1/guilds/100000000000000001/social/subscriptions',
			headers: { authorization: 'contract-key', 'content-type': 'application/json' },
			payload: '{invalid'
		});
		expect(res.statusCode).toBe(400);
		expect(res.json()).toMatchObject({ error: 'invalid_params' });
	});
});
