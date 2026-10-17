import Fastify from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requireAuth } from '../plugins/auth.ts';
import { ObjectStore } from '../services/objectStore.ts';
import { registerObjectRoutes } from './objects.ts';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

let dir: string;
let fastify: ReturnType<typeof Fastify>;
let store: ObjectStore;

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'storage-'));
	store = new ObjectStore(dir);
	fastify = Fastify();
	await registerObjectRoutes(fastify, { store, guard: requireAuth('key'), publicUrl: 'https://cdn.example.com' });
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
	await fastify.close();
});

describe('GET /:bucket/*', () => {
	it('인증 없이 이미지를 주고 보안·캐시 헤더를 붙여요', async () => {
		await store.put('guild-assets', 'g1/a.png', PNG, 'image/png');
		const res = await fastify.inject({ method: 'GET', url: '/guild-assets/g1/a.png' });
		expect(res.statusCode).toBe(200);
		expect(res.headers['content-type']).toBe('image/png');
		expect(res.headers['x-content-type-options']).toBe('nosniff');
		expect(res.headers['content-disposition']).toBe('inline');
		expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
		expect(res.rawPayload.length).toBe(PNG.length);
	});

	it('없으면 404 JSON을 줘요', async () => {
		const res = await fastify.inject({ method: 'GET', url: '/guild-assets/g1/none.png' });
		expect(res.statusCode).toBe(404);
		expect(res.json()).toEqual({ error: '이미지를 찾을 수 없어요.' });
	});

	it('경로 탈출 키는 400이에요', async () => {
		// 이중 인코딩(%252e)이어야 URL 정규화를 지나 핸들러의 키 검증까지 도달해요
		const res = await fastify.inject({ method: 'GET', url: '/guild-assets/g1/%252e%252e/%252e%252e/etc/passwd' });
		expect(res.statusCode).toBe(400);
	});
});
