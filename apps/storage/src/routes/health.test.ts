import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import health from './health.ts';

describe('GET /health', () => {
	it('인증 없이 응답해요', async () => {
		const fastify = Fastify();
		await health(fastify);
		const res = await fastify.inject({ method: 'GET', url: '/health' });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ ok: true });
		await fastify.close();
	});
});
