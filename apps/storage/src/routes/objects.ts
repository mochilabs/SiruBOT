import type { FastifyInstance, FastifyReply, preHandlerAsyncHookHandler } from 'fastify';
import { ASSET_ALLOWED_MIME_TYPES, ASSET_MAX_BYTES, sniffImageMime, TICKET_TRANSCRIPT_BUCKET } from '@sirubot/utils';
import { ObjectPathError, ObjectStore, INVALID_OBJECT_PATH_MESSAGE, contentTypeForKey } from '../services/objectStore.ts';

interface ObjectRouteOptions {
	store: ObjectStore;
	guard: preHandlerAsyncHookHandler;
	publicUrl: string;
}

const DEFAULT_MAX_KEYS = 1000;

/** 비공개 transcript 상한 — 텍스트를 gzip한 결과 기준이에요 (긴 상담도 수백 KB 수준) */
const TICKET_TRANSCRIPT_MAX_BYTES = 16 * 1024 * 1024;

type StoreCallResult<T> = { ok: true; value: T } | { ok: false; reply: FastifyReply };

/** store 호출을 실행하고 ObjectPathError만 라우트 층에서 400으로 매핑해요(server.ts의 공용 에러 계약). 그 외 오류는 위로 던져요. */
async function storeCall<T>(reply: FastifyReply, run: () => Promise<T>): Promise<StoreCallResult<T>> {
	try {
		return { ok: true, value: await run() };
	} catch (error) {
		if (error instanceof ObjectPathError) return { ok: false, reply: reply.code(400).send({ error: INVALID_OBJECT_PATH_MESSAGE }) };
		throw error;
	}
}

export async function registerObjectRoutes(fastify: FastifyInstance, options: ObjectRouteOptions): Promise<void> {
	const { store, guard, publicUrl } = options;

	// 업로드 body는 원시 바이트로 받아요. 클라이언트 Content-Type은 신뢰하지 않고 매직 바이트로 검증해요.
	fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
		done(null, body);
	});

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

			// 비공개 버킷(티켓 transcript)은 문서라 매직 바이트 이미지 검증을 하지 않아요 — 크기 상한만 지켜요.
			if (bucket === TICKET_TRANSCRIPT_BUCKET) {
				if (!key.endsWith('.json.gz')) return reply.code(400).send({ error: 'transcript는 .json.gz 형식이어야 해요.' });
				if (bytes.length > TICKET_TRANSCRIPT_MAX_BYTES) {
					return reply.code(413).send({ error: 'transcript가 너무 커요. 최대 16MB까지 올릴 수 있어요.' });
				}
				const putResult = await storeCall(reply, () => store.put(bucket, key, bytes, 'application/gzip'));
				if (!putResult.ok) return putResult.reply;
				const saved = putResult.value;
				// 비공개 버킷은 공개 URL을 발급하지 않아요 — key만 돌려주고 대시보드가 storage 인증으로 내려받아요.
				return reply.code(201).send({ bucket, key: saved.key, size: saved.size, contentType: 'application/gzip', etag: saved.etag });
			}

			if (bytes.length > ASSET_MAX_BYTES) return reply.code(413).send({ error: '이미지가 너무 커요. 최대 8MB까지 올릴 수 있어요.' });

			const mime = sniffImageMime(bytes);
			if (!mime || !ASSET_ALLOWED_MIME_TYPES.has(mime)) {
				return reply.code(400).send({ error: 'PNG, JPEG, WebP, GIF 이미지만 지원해요.' });
			}
			if (contentTypeForKey(key) !== mime) {
				return reply.code(400).send({ error: '이미지 형식과 확장자가 맞지 않아요.' });
			}

			const putResult = await storeCall(reply, () => store.put(bucket, key, bytes, mime));
			if (!putResult.ok) return putResult.reply;
			const saved = putResult.value;
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

	// 공개 조회 (GET /:bucket/*key): 인증 없음. 디스코드 이미지 프록시가 직접 fetch해요.
	fastify.get<{ Params: { bucket: string; '*': string } }>('/:bucket/*', async (request, reply) => {
		// 비공개 버킷은 공개 GET을 막아요 — 인증된 DELETE/목록만 남고, 읽기는 대시보드가 별도 경로로 처리해요.
		if (request.params.bucket === TICKET_TRANSCRIPT_BUCKET) return reply.code(404).send({ error: '이미지를 찾을 수 없어요.' });
		const getResult = await storeCall(reply, () => store.get(request.params.bucket, request.params['*']));
		if (!getResult.ok) return getResult.reply;
		const got = getResult.value;
		if (!got) return reply.code(404).send({ error: '이미지를 찾을 수 없어요.' });
		return reply
			.header('content-type', got.contentType)
			.header('x-content-type-options', 'nosniff')
			.header('content-disposition', 'inline')
			.header('cache-control', 'public, max-age=31536000, immutable')
			.send(Buffer.from(got.bytes));
	});

	// 목록 (GET /:bucket?prefix=&max-keys=)
	fastify.get<{ Params: { bucket: string }; Querystring: { prefix?: string; 'max-keys'?: string } }>(
		'/:bucket',
		{ preHandler: guard },
		async (request, reply) => {
			const prefix = request.query.prefix ?? '';
			if (prefix.includes('..')) return reply.code(400).send({ error: INVALID_OBJECT_PATH_MESSAGE });
			const parsedMaxKeys = Number.parseInt(request.query['max-keys'] ?? '', 10);
			const maxKeys = Number.isFinite(parsedMaxKeys) && parsedMaxKeys > 0 ? Math.min(parsedMaxKeys, DEFAULT_MAX_KEYS) : DEFAULT_MAX_KEYS;

			const listResult = await storeCall(reply, () => store.list(request.params.bucket, prefix));
			if (!listResult.ok) return listResult.reply;
			const listed = listResult.value;
			return reply.send({
				contents: listed.slice(0, maxKeys),
				isTruncated: listed.length > maxKeys,
				prefix
			});
		}
	);

	fastify.delete<{ Params: { bucket: string; '*': string } }>('/:bucket/*', { preHandler: guard }, async (request, reply) => {
		const deleteResult = await storeCall(reply, () => store.delete(request.params.bucket, request.params['*']));
		if (!deleteResult.ok) return deleteResult.reply;
		const removed = deleteResult.value;
		if (!removed) return reply.code(404).send({ error: '이미지를 찾을 수 없어요.' });
		return reply.code(204).send();
	});
}
