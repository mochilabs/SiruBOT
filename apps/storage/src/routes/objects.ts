import type { FastifyInstance, FastifyReply, preHandlerAsyncHookHandler } from 'fastify';
import { ASSET_ALLOWED_MIME_TYPES, ASSET_MAX_BYTES, sniffImageMime, TICKET_TRANSCRIPT_BUCKET } from '@sirubot/utils';
import { ObjectPathError, ObjectStore, INVALID_OBJECT_PATH_MESSAGE, contentTypeForKey } from '../services/objectStore.ts';

interface ObjectRouteOptions {
	store: ObjectStore;
	guard: preHandlerAsyncHookHandler;
	publicUrl: string;
}

interface UploadContext {
	store: ObjectStore;
	reply: FastifyReply;
	bucket: string;
	key: string;
	bytes: Uint8Array;
}

type ObjectParams = { bucket: string; '*': string };
type StoreCallResult<T> = { ok: true; value: T } | { ok: false; reply: FastifyReply };

const MAX_LIST_KEYS = 1000;
const NOT_FOUND_MESSAGE = '이미지를 찾을 수 없어요.';
const TRANSCRIPT_EXTENSION = '.json.gz';
const TRANSCRIPT_MIME = 'application/gzip';
const TRANSCRIPT_MAX_BYTES = 16 * 1024 * 1024;

async function storeCall<T>(reply: FastifyReply, run: () => Promise<T>): Promise<StoreCallResult<T>> {
	try {
		return { ok: true, value: await run() };
	} catch (error) {
		if (error instanceof ObjectPathError) return { ok: false, reply: reply.code(400).send({ error: INVALID_OBJECT_PATH_MESSAGE }) };
		throw error;
	}
}

function parseMaxKeys(raw: string | undefined): number {
	const parsed = Number.parseInt(raw ?? '', 10);
	return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_LIST_KEYS) : MAX_LIST_KEYS;
}

function publicObjectUrl(publicUrl: string, bucket: string, key: string): string {
	return `${publicUrl.replace(/\/+$/, '')}/${bucket}/${key}`;
}

async function uploadTranscript({ store, reply, bucket, key, bytes }: UploadContext) {
	if (!key.endsWith(TRANSCRIPT_EXTENSION)) return reply.code(400).send({ error: `transcript는 ${TRANSCRIPT_EXTENSION} 형식이어야 해요.` });
	if (bytes.length > TRANSCRIPT_MAX_BYTES) return reply.code(413).send({ error: 'transcript가 너무 커요. 최대 16MB까지 올릴 수 있어요.' });

	const put = await storeCall(reply, () => store.put(bucket, key, bytes, TRANSCRIPT_MIME));
	if (!put.ok) return put.reply;
	const { size, etag } = put.value;
	return reply.code(201).send({ bucket, key: put.value.key, size, contentType: TRANSCRIPT_MIME, etag });
}

async function uploadImage({ store, reply, bucket, key, bytes }: UploadContext, publicUrl: string) {
	if (bytes.length > ASSET_MAX_BYTES) return reply.code(413).send({ error: '이미지가 너무 커요. 최대 8MB까지 올릴 수 있어요.' });

	const mime = sniffImageMime(bytes);
	if (!mime || !ASSET_ALLOWED_MIME_TYPES.has(mime)) return reply.code(400).send({ error: 'PNG, JPEG, WebP, GIF 이미지만 지원해요.' });
	if (contentTypeForKey(key) !== mime) return reply.code(400).send({ error: '이미지 형식과 확장자가 맞지 않아요.' });

	const put = await storeCall(reply, () => store.put(bucket, key, bytes, mime));
	if (!put.ok) return put.reply;
	const { size, etag } = put.value;
	return reply
		.code(201)
		.send({ bucket, key: put.value.key, size, contentType: mime, etag, url: publicObjectUrl(publicUrl, bucket, put.value.key) });
}

export async function registerObjectRoutes(fastify: FastifyInstance, options: ObjectRouteOptions): Promise<void> {
	const { store, guard, publicUrl } = options;

	fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
		done(null, body);
	});

	fastify.put<{ Params: ObjectParams }>('/:bucket/*', { preHandler: guard, bodyLimit: ASSET_MAX_BYTES }, async (request, reply) => {
		const { bucket } = request.params;
		const key = request.params['*'];
		const body: unknown = request.body;
		if (body === undefined || (Buffer.isBuffer(body) && body.length === 0)) return reply.code(400).send({ error: '빈 파일은 올릴 수 없어요.' });
		if (!Buffer.isBuffer(body)) return reply.code(400).send({ error: '파일 본문이 필요해요.' });

		const upload: UploadContext = { store, reply, bucket, key, bytes: new Uint8Array(body) };
		return bucket === TICKET_TRANSCRIPT_BUCKET ? uploadTranscript(upload) : uploadImage(upload, publicUrl);
	});

	fastify.get<{ Params: ObjectParams }>('/:bucket/*', async (request, reply) => {
		const { bucket } = request.params;
		if (bucket === TICKET_TRANSCRIPT_BUCKET) return reply.code(404).send({ error: NOT_FOUND_MESSAGE });

		const get = await storeCall(reply, () => store.get(bucket, request.params['*']));
		if (!get.ok) return get.reply;
		if (!get.value) return reply.code(404).send({ error: NOT_FOUND_MESSAGE });
		return reply
			.header('content-type', get.value.contentType)
			.header('x-content-type-options', 'nosniff')
			.header('content-disposition', 'inline')
			.header('cache-control', 'public, max-age=31536000, immutable')
			.send(Buffer.from(get.value.bytes));
	});

	fastify.get<{ Params: { bucket: string }; Querystring: { prefix?: string; 'max-keys'?: string } }>(
		'/:bucket',
		{ preHandler: guard },
		async (request, reply) => {
			const prefix = request.query.prefix ?? '';
			if (prefix.includes('..')) return reply.code(400).send({ error: INVALID_OBJECT_PATH_MESSAGE });
			const maxKeys = parseMaxKeys(request.query['max-keys']);

			const list = await storeCall(reply, () => store.list(request.params.bucket, prefix));
			if (!list.ok) return list.reply;
			return reply.send({ contents: list.value.slice(0, maxKeys), isTruncated: list.value.length > maxKeys, prefix });
		}
	);

	fastify.delete<{ Params: ObjectParams }>('/:bucket/*', { preHandler: guard }, async (request, reply) => {
		const removal = await storeCall(reply, () => store.delete(request.params.bucket, request.params['*']));
		if (!removal.ok) return removal.reply;
		if (!removal.value) return reply.code(404).send({ error: NOT_FOUND_MESSAGE });
		return reply.code(204).send();
	});
}
