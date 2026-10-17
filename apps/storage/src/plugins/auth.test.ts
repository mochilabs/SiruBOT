import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { requireAuth } from './auth.ts';

describe('storage auth', () => {
	it('키가 없으면 기동을 거부해요', () => {
		expect(() => requireAuth('')).toThrow();
	});

	it('Authorization 헤더 키가 다르면 401이에요', async () => {
		const fastify = Fastify();
		fastify.get('/x', { preHandler: requireAuth('secret') }, async () => ({ ok: true }));
		const wrong = await fastify.inject({ method: 'GET', url: '/x', headers: { authorization: 'wrong' } });
		expect(wrong.statusCode).toBe(401);
		const missing = await fastify.inject({ method: 'GET', url: '/x' });
		expect(missing.statusCode).toBe(401);
		await fastify.close();
	});

	it('키가 맞으면 통과해요', async () => {
		const fastify = Fastify();
		fastify.get('/x', { preHandler: requireAuth('secret') }, async () => ({ ok: true }));
		const res = await fastify.inject({ method: 'GET', url: '/x', headers: { authorization: 'secret' } });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ ok: true });
		await fastify.close();
	});
});
