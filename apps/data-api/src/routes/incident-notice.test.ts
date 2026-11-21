import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerIncidentNoticeRoutes } from './incident-notice.ts';

async function buildApp() {
	const fastify = Fastify({ logger: false });
	registerIncidentNoticeRoutes(fastify);
	return fastify;
}

describe('incident notice routes', () => {
	it('만료 시간이 없으면 400이에요', async () => {
		const fastify = await buildApp();
		const response = await fastify.inject({ method: 'POST', url: '/v1/internal/incident-notice', payload: { message: '점검 중' } });
		expect(response.statusCode).toBe(400);
		expect(response.json().error).toBe('invalid_params');
		await fastify.close();
	});

	it('200자를 넘거나 7일을 넘으면 400이에요', async () => {
		const fastify = await buildApp();
		const tooLong = await fastify.inject({
			method: 'POST',
			url: '/v1/internal/incident-notice',
			payload: { message: 'a'.repeat(201), expiresInMinutes: 10 }
		});
		const tooLate = await fastify.inject({
			method: 'POST',
			url: '/v1/internal/incident-notice',
			payload: { message: '점검 중', expiresInMinutes: 7 * 24 * 60 + 1 }
		});
		expect(tooLong.statusCode).toBe(400);
		expect(tooLate.statusCode).toBe(400);
		await fastify.close();
	});

	it('Redis가 없으면 조회·기록·삭제는 503이에요 (메모리 폴백은 봇에 닿지 않아요)', async () => {
		const fastify = await buildApp();
		const get = await fastify.inject({ method: 'GET', url: '/v1/internal/incident-notice' });
		const post = await fastify.inject({
			method: 'POST',
			url: '/v1/internal/incident-notice',
			payload: { message: '점검 중', expiresInMinutes: 10 }
		});
		const del = await fastify.inject({ method: 'DELETE', url: '/v1/internal/incident-notice' });
		expect([get.statusCode, post.statusCode, del.statusCode]).toEqual([503, 503, 503]);
		await fastify.close();
	});
});
