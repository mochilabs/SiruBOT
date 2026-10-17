import Fastify from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requireAuth } from '../plugins/auth.ts';
import { ObjectStore } from '../services/objectStore.ts';
import { registerObjectRoutes } from './objects.ts';

let dir: string;
let fastify: ReturnType<typeof Fastify>;
let store: ObjectStore;

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'storage-'));
	store = new ObjectStore(dir);
	fastify = Fastify();
	await registerObjectRoutes(fastify, { store, guard: requireAuth('key'), publicUrl: 'https://cdn.example.com' });
	await store.put('guild-assets', 'g1/a.png', new Uint8Array([1]), 'image/png');
	await store.put('guild-assets', 'g1/b.png', new Uint8Array([2]), 'image/png');
	await store.put('guild-assets', 'g2/c.png', new Uint8Array([3]), 'image/png');
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
	await fastify.close();
});

describe('GET /:bucket (LIST)', () => {
	it('prefix로 목록을 줘요', async () => {
		const res = await fastify.inject({ method: 'GET', url: '/guild-assets?prefix=g1/', headers: { authorization: 'key' } });
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.prefix).toBe('g1/');
		expect(body.isTruncated).toBe(false);
		expect(body.contents.map((o: { key: string }) => o.key)).toEqual(['g1/a.png', 'g1/b.png']);
		expect(body.contents[0]).toMatchObject({ size: 1, contentType: 'image/png' });
		expect(typeof body.contents[0].lastModified).toBe('string');
		expect(typeof body.contents[0].etag).toBe('string');
	});

	it('max-keys를 넘기면 isTruncated예요', async () => {
		const res = await fastify.inject({ method: 'GET', url: '/guild-assets?max-keys=2', headers: { authorization: 'key' } });
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.contents.length).toBe(2);
		expect(body.isTruncated).toBe(true);
	});

	it('인증 없으면 401이에요', async () => {
		const res = await fastify.inject({ method: 'GET', url: '/guild-assets?prefix=g1/' });
		expect(res.statusCode).toBe(401);
	});

	it('prefix에 ..가 있으면 400이에요', async () => {
		const res = await fastify.inject({ method: 'GET', url: '/guild-assets?prefix=../', headers: { authorization: 'key' } });
		expect(res.statusCode).toBe(400);
	});
});

describe('DELETE /:bucket/*', () => {
	it('삭제하면 204, 없으면 404예요', async () => {
		const removed = await fastify.inject({ method: 'DELETE', url: '/guild-assets/g1/a.png', headers: { authorization: 'key' } });
		expect(removed.statusCode).toBe(204);
		expect(await store.get('guild-assets', 'g1/a.png')).toBeNull();

		const missing = await fastify.inject({ method: 'DELETE', url: '/guild-assets/g1/a.png', headers: { authorization: 'key' } });
		expect(missing.statusCode).toBe(404);
	});

	it('인증 없으면 401이에요', async () => {
		const res = await fastify.inject({ method: 'DELETE', url: '/guild-assets/g1/a.png' });
		expect(res.statusCode).toBe(401);
	});

	it('경로 탈출 키는 400이에요', async () => {
		// 이중 인코딩(%252e)이어야 URL 정규화를 지나 핸들러의 키 검증까지 도달해요
		const res = await fastify.inject({ method: 'DELETE', url: '/guild-assets/g1/%252e%252e/escape.png', headers: { authorization: 'key' } });
		expect(res.statusCode).toBe(400);
	});
});
