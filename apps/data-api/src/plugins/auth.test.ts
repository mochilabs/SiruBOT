import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import auth from './auth.ts';

const KEY = 'data-api-test-key-1234';

async function buildTestApp(dataApiAuthKey: string) {
	const fastify = Fastify({ logger: false });
	await auth(fastify, dataApiAuthKey);
	// 인증 통과 여부만 확인하면 돼서, 200을 반환하는 탐침 라우트를 등록해요.
	fastify.get('/probe', async () => ({ ok: true }));
	fastify.get('/api/health', async () => ({ ok: true }));
	fastify.get('/api/health/live', async () => ({ ok: true }));
	return fastify;
}

describe('auth plugin', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('키가 없으면 fail-closed로 기동을 거절한다', async () => {
		// 라이브러리는 throw로 거절해요 — 진입점(index.ts main().catch)이 process.exit(1)로 이어져요.
		const fastify = Fastify({ logger: false });
		await expect(auth(fastify, undefined)).rejects.toThrow(/AUTH_KEY is not set/);
		await fastify.close();
	});

	it('정확히 일치하는 키는 인증을 통과한다', async () => {
		const fastify = await buildTestApp(KEY);
		const response = await fastify.inject({ method: 'GET', url: '/probe', headers: { authorization: KEY } });
		expect(response.statusCode).toBe(200);
		await fastify.close();
	});

	it('근사치 키는 모두 거절한다', async () => {
		const fastify = await buildTestApp(KEY);
		const nearMisses = [`${KEY}x`, `${KEY} `, ` ${KEY}`, KEY.toUpperCase(), 'short', ''];
		for (const wrong of nearMisses) {
			const response = await fastify.inject({ method: 'GET', url: '/probe', headers: { authorization: wrong } });
			expect(response.statusCode, `authorization=${JSON.stringify(wrong)}`).toBe(401);
		}
		await fastify.close();
	});

	it('authorization 헤더가 없으면 401을 반환한다', async () => {
		const fastify = await buildTestApp(KEY);
		const response = await fastify.inject({ method: 'GET', url: '/probe' });
		expect(response.statusCode).toBe(401);
		expect(response.json()).toEqual({ error: '인증 정보가 없어요.' });
		await fastify.close();
	});

	it('잘못된 키는 401 한국어 문구를 반환한다', async () => {
		const fastify = await buildTestApp(KEY);
		const response = await fastify.inject({ method: 'GET', url: '/probe', headers: { authorization: 'wrong' } });
		expect(response.statusCode).toBe(401);
		expect(response.json()).toEqual({ error: '인증에 실패했어요.' });
		await fastify.close();
	});

	it('/api/health 정확한 경로만 인증 없이 허용한다 (접두사 매칭 금지)', async () => {
		const fastify = await buildTestApp(KEY);
		for (const url of ['/api/health', '/api/health?probe=1']) {
			const response = await fastify.inject({ method: 'GET', url });
			expect(response.statusCode, `url=${url}`).toBe(200);
		}
		// 접두사로 겹치는 경로는 인증이 필요해요 — 미래 라우트가 무인증으로 새는 것을 막아요
		for (const url of ['/api/health/live', '/api/healthz']) {
			const response = await fastify.inject({ method: 'GET', url });
			expect(response.statusCode, `url=${url}`).toBe(401);
		}
		await fastify.close();
	});
});
