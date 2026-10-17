import Fastify from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requireAuth } from '../plugins/auth.ts';
import { ObjectStore } from '../services/objectStore.ts';
import { registerObjectRoutes } from './objects.ts';

// inject payload는 Buffer로 실어야 원시 바이트가 돼요 (Uint8Array는 JSON으로 직렬화돼요)
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

let dir: string;
let fastify: ReturnType<typeof Fastify>;

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'storage-'));
	fastify = Fastify();
	await registerObjectRoutes(fastify, { store: new ObjectStore(dir), guard: requireAuth('key'), publicUrl: 'https://cdn.example.com' });
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
	await fastify.close();
});

describe('PUT /:bucket/*', () => {
	it('업로드하면 201과 공개 URL을 줘요', async () => {
		const res = await fastify.inject({
			method: 'PUT',
			url: '/guild-assets/g1/a.png',
			headers: { authorization: 'key', 'content-type': 'image/png' },
			payload: PNG
		});
		expect(res.statusCode).toBe(201);
		expect(res.json()).toMatchObject({
			bucket: 'guild-assets',
			key: 'g1/a.png',
			contentType: 'image/png',
			url: 'https://cdn.example.com/guild-assets/g1/a.png'
		});
		expect(res.json().size).toBe(PNG.length);
		expect(typeof res.json().etag).toBe('string');
	});

	it('매직 바이트와 확장자가 안 맞으면 400이에요', async () => {
		const notImage = await fastify.inject({
			method: 'PUT',
			url: '/guild-assets/g1/a.png',
			headers: { authorization: 'key', 'content-type': 'image/png' },
			payload: Buffer.from([1, 2, 3])
		});
		expect(notImage.statusCode).toBe(400);

		const wrongExt = await fastify.inject({
			method: 'PUT',
			url: '/guild-assets/g1/b.png',
			headers: { authorization: 'key', 'content-type': 'image/png' },
			payload: JPEG
		});
		expect(wrongExt.statusCode).toBe(400);
	});

	it('인증 없으면 401, 키가 틀리면 401이에요', async () => {
		const missing = await fastify.inject({ method: 'PUT', url: '/guild-assets/g1/a.png', payload: PNG });
		expect(missing.statusCode).toBe(401);
		const wrong = await fastify.inject({
			method: 'PUT',
			url: '/guild-assets/g1/a.png',
			headers: { authorization: 'nope' },
			payload: PNG
		});
		expect(wrong.statusCode).toBe(401);
	});

	it('크기 상한을 넘으면 413이에요', async () => {
		const big = Buffer.alloc(9 * 1024 * 1024);
		PNG.copy(big);
		const res = await fastify.inject({
			method: 'PUT',
			url: '/guild-assets/g1/big.png',
			headers: { authorization: 'key', 'content-type': 'image/png' },
			payload: big
		});
		expect(res.statusCode).toBe(413);
	});

	it('빈 파일은 400이에요', async () => {
		const res = await fastify.inject({
			method: 'PUT',
			url: '/guild-assets/g1/empty.png',
			headers: { authorization: 'key', 'content-type': 'image/png' },
			payload: Buffer.alloc(0)
		});
		expect(res.statusCode).toBe(400);
	});

	it('경로 탈출 키는 400이에요', async () => {
		// 이중 인코딩(%252e)이어야 URL 정규화를 지나 핸들러의 키 검증까지 도달해요
		const res = await fastify.inject({
			method: 'PUT',
			url: '/guild-assets/g1/%252e%252e/escape.png',
			headers: { authorization: 'key', 'content-type': 'image/png' },
			payload: PNG
		});
		expect(res.statusCode).toBe(400);
	});
});
