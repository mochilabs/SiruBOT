import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from './config/env.ts';
import { buildServer } from './server.ts';

// 공용 에러 계약 스모크 — buildServer가 등록한 errorHandler·auth 401·notFound shape를 잠가요.

let dir: string;
let fastify: Awaited<ReturnType<typeof buildServer>>['fastify'];

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'storage-contract-'));
	const env = {
		PORT: 0,
		STORAGE_DATA_DIR: dir,
		STORAGE_PUBLIC_URL: 'https://cdn.example.com',
		storageAuthKey: 'contract-key'
	} as unknown as Env;
	({ fastify } = await buildServer(env));
});

afterEach(async () => {
	await fastify.close();
	await rm(dir, { recursive: true, force: true });
});

describe('storage error contract', () => {
	it('보호 라우트 401은 { error } 한국어 문구 shape예요', async () => {
		const res = await fastify.inject({ method: 'GET', url: '/guild-assets' });
		expect(res.statusCode).toBe(401);
		expect(res.json()).toEqual({ error: '인증 정보가 없어요.' });
	});

	it('라우트 미존재 404는 공용 not_found shape예요 (Fastify 기본 shape 아님)', async () => {
		const res = await fastify.inject({ method: 'PUT', url: '/single-segment' });
		expect(res.statusCode).toBe(404);
		expect(res.json()).toEqual({ error: 'not_found', message: '요청한 리소스를 찾을 수 없어요.' });
	});

	it('라우트 레벨 개별 400 매핑은 그대로 유지돼요', async () => {
		const res = await fastify.inject({ method: 'GET', url: '/guild-assets/g1/%252e%252e/etc/passwd' });
		expect(res.statusCode).toBe(400);
		expect(res.json()).toEqual({ error: '경로가 올바르지 않아요.' });
	});
});
