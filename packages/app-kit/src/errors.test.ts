import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { ZodError, z } from 'zod';
import { registerAppErrorHandler, toHttpErrorResponse, zodIssuesMessage } from './errors.ts';

// 에러 계약 회귀 테스트 — 4apps 공용 { error: 코드, message: 한국어 } shape를 잠가요.

function zodError(): ZodError {
	return z.object({ id: z.string() }).safeParse({ id: 1 }).error!;
}

describe('zodIssuesMessage', () => {
	it('이슈를 "path: message; ..."로 조인해요 (data-api sendError 포맷)', () => {
		const error = z.object({ id: z.string(), nested: z.object({ n: z.number() }) }).safeParse({ id: 1, nested: { n: 'x' } }).error!;
		expect(zodIssuesMessage(error)).toBe(
			'id: Invalid input: expected string, received number; nested.n: Invalid input: expected number, received string'
		);
	});
});

describe('toHttpErrorResponse', () => {
	it('ZodError는 400 invalid_params로 매핑돼요', () => {
		const { status, body } = toHttpErrorResponse(zodError());
		expect(status).toBe(400);
		expect(body.error).toBe('invalid_params');
		expect(body.message).toContain('id:');
	});

	it('Fastify 4xx statusCode는 코드·한국어 문구로 매핑돼요', () => {
		expect(toHttpErrorResponse({ statusCode: 404 })).toEqual({
			status: 404,
			body: { error: 'not_found', message: '요청한 리소스를 찾을 수 없어요.' }
		});
		expect(toHttpErrorResponse({ statusCode: 415 })).toEqual({
			status: 415,
			body: { error: 'unsupported_media_type', message: '지원하지 않는 본문 형식이에요.' }
		});
		const unknown4xx = toHttpErrorResponse({ statusCode: 418 });
		expect(unknown4xx.status).toBe(418);
		expect(unknown4xx.body.error).toBe('bad_request');
	});

	it('미확인 예외는 500 internal_error — 내부 사유는 본문에 없어요', () => {
		const { status, body } = toHttpErrorResponse(new Error('비밀 내부 사유'));
		expect(status).toBe(500);
		expect(body).toEqual({ error: 'internal_error', message: '일시적인 오류예요. 잠시 후 다시 시도해 주세요.' });
		expect(JSON.stringify(body)).not.toContain('비밀');
	});
});

describe('createAppErrorHandler', () => {
	it('5xx는 logger.error + onServerError를 호출하고 4xx는 warn만 남겨요', async () => {
		const fastify = Fastify();
		const onServerError = vi.fn();
		const logger = { warn: vi.fn(), error: vi.fn() };
		registerAppErrorHandler(fastify, { logger, onServerError });
		fastify.get('/boom', async () => {
			throw new Error('db down');
		});
		fastify.get('/teapot', async () => {
			throw Object.assign(new Error('teapot'), { statusCode: 418 });
		});

		const boom = await fastify.inject({ method: 'GET', url: '/boom' });
		expect(boom.statusCode).toBe(500);
		expect(boom.json()).toEqual({ error: 'internal_error', message: '일시적인 오류예요. 잠시 후 다시 시도해 주세요.' });
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(onServerError).toHaveBeenCalledTimes(1);

		const teapot = await fastify.inject({ method: 'GET', url: '/teapot' });
		expect(teapot.statusCode).toBe(418);
		expect(teapot.json()).toMatchObject({ error: 'bad_request' });
		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(onServerError).toHaveBeenCalledTimes(1);
		await fastify.close();
	});

	it('본문 파싱 실패(400)도 공용 계약으로 수거돼요', async () => {
		const fastify = Fastify();
		fastify.post('/x', async () => ({ ok: true }));
		registerAppErrorHandler(fastify, { logger: { warn: vi.fn(), error: vi.fn() } });

		const res = await fastify.inject({ method: 'POST', url: '/x', headers: { 'content-type': 'application/json' }, payload: '{invalid' });
		expect(res.statusCode).toBe(400);
		expect(res.json()).toMatchObject({ error: 'invalid_params' });
		await fastify.close();
	});
});
