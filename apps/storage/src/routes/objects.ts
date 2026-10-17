import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { ASSET_ALLOWED_MIME_TYPES, ASSET_MAX_BYTES, sniffImageMime } from '@sirubot/utils';
import { ObjectPathError, ObjectStore, type StoredObject, contentTypeForKey } from '../services/objectStore.ts';

interface ObjectRouteOptions {
	store: ObjectStore;
	guard: preHandlerAsyncHookHandler;
	publicUrl: string;
}

const DEFAULT_MAX_KEYS = 1000;

export async function registerObjectRoutes(fastify: FastifyInstance, options: ObjectRouteOptions): Promise<void> {
	const { store, guard, publicUrl } = options;

	// 업로드 body는 원시 바이트로 받아요 — 클라이언트 Content-Type은 신뢰하지 않고 매직 바이트로 검증해요.
	fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
		done(null, body);
	});

	// 업로드 (PUT /:bucket/*key) — 보호 라우트
	fastify.put<{ Params: { bucket: string; '*': string } }>(
		'/:bucket/*',
		{ preHandler: guard, bodyLimit: ASSET_MAX_BYTES },
		async (request, reply) => {
			const { bucket } = request.params;
			const key = request.params['*'];
			const body: unknown = request.body;
			if (body === undefined || (Buffer.isBuffer(body) && body.length === 0)) {
				return reply.code(400).send({ error: '빈 파일은 올릴 수 없어요.' });
			}
			if (!Buffer.isBuffer(body)) return reply.code(400).send({ error: '파일 본문이 필요해요.' });
			const bytes = new Uint8Array(body);
			if (bytes.length > ASSET_MAX_BYTES) return reply.code(413).send({ error: '이미지가 너무 커요. 최대 8MB까지 올릴 수 있어요.' });

			const mime = sniffImageMime(bytes);
			if (!mime || !ASSET_ALLOWED_MIME_TYPES.has(mime)) {
				return reply.code(400).send({ error: 'PNG, JPEG, WebP, GIF 이미지만 지원해요.' });
			}
			if (contentTypeForKey(key) !== mime) {
				return reply.code(400).send({ error: '이미지 형식과 확장자가 맞지 않아요.' });
			}

			let saved: StoredObject;
			try {
				saved = await store.put(bucket, key, bytes, mime);
			} catch (error) {
				if (error instanceof ObjectPathError) return reply.code(400).send({ error: '경로가 올바르지 않아요.' });
				throw error;
			}
			return reply.code(201).send({
				bucket,
				key: saved.key,
				size: saved.size,
				contentType: mime,
				etag: saved.etag,
				url: `${publicUrl.replace(/\/+$/, '')}/${bucket}/${saved.key}`
			});
		}
	);

	// 공개 조회 (GET /:bucket/*key) — 인증 없음. 디스코드 이미지 프록시가 직접 fetch해요.
	fastify.get<{ Params: { bucket: string; '*': string } }>('/:bucket/*', async (request, reply) => {
		let got: { bytes: Uint8Array; contentType: string } | null;
		try {
			got = await store.get(request.params.bucket, request.params['*']);
		} catch (error) {
			if (error instanceof ObjectPathError) return reply.code(400).send({ error: '경로가 올바르지 않아요.' });
			throw error;
		}
		if (!got) return reply.code(404).send({ error: '이미지를 찾을 수 없어요.' });
		return reply
			.header('content-type', got.contentType)
			.header('x-content-type-options', 'nosniff')
			.header('content-disposition', 'inline')
			.header('cache-control', 'public, max-age=31536000, immutable')
			.send(Buffer.from(got.bytes));
	});

	// 목록 (GET /:bucket?prefix=&max-keys=) — 보호 라우트
	fastify.get<{ Params: { bucket: string }; Querystring: { prefix?: string; 'max-keys'?: string } }>(
		'/:bucket',
		{ preHandler: guard },
		async (request, reply) => {
			const prefix = request.query.prefix ?? '';
			if (prefix.includes('..')) return reply.code(400).send({ error: '경로가 올바르지 않아요.' });
			const parsedMaxKeys = Number.parseInt(request.query['max-keys'] ?? '', 10);
			const maxKeys = Number.isFinite(parsedMaxKeys) && parsedMaxKeys > 0 ? Math.min(parsedMaxKeys, DEFAULT_MAX_KEYS) : DEFAULT_MAX_KEYS;

			let listed: StoredObject[];
			try {
				listed = await store.list(request.params.bucket, prefix);
			} catch (error) {
				if (error instanceof ObjectPathError) return reply.code(400).send({ error: '경로가 올바르지 않아요.' });
				throw error;
			}
			return reply.send({
				contents: listed.slice(0, maxKeys),
				isTruncated: listed.length > maxKeys,
				prefix
			});
		}
	);

	// 삭제 (DELETE /:bucket/*key) — 보호 라우트
	fastify.delete<{ Params: { bucket: string; '*': string } }>('/:bucket/*', { preHandler: guard }, async (request, reply) => {
		let removed: boolean;
		try {
			removed = await store.delete(request.params.bucket, request.params['*']);
		} catch (error) {
			if (error instanceof ObjectPathError) return reply.code(400).send({ error: '경로가 올바르지 않아요.' });
			throw error;
		}
		if (!removed) return reply.code(404).send({ error: '이미지를 찾을 수 없어요.' });
		return reply.code(204).send();
	});
}
