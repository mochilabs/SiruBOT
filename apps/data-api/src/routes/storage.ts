import type { FastifyInstance, FastifyReply } from 'fastify';
import { TICKET_TRANSCRIPT_BUCKET } from '@sirubot/utils';

const TRANSCRIPT_KEY_PATTERN = /^\d{17,20}\/[0-9a-f-]{36}\.json\.gz$/;
const TRANSCRIPT_MAX_BYTES = 16 * 1024 * 1024;

export interface StorageProxyDeps {
	storageUrl?: string;
	storageAuthKey?: string;
}

export function registerStorageProxyRoutes(fastify: FastifyInstance, deps: StorageProxyDeps): void {
	const base = deps.storageUrl?.replace(/\/+$/, '');
	const authKey = deps.storageAuthKey ?? '';

	const unavailable = (reply: FastifyReply) => reply.code(503).send({ error: 'storage_unavailable', message: '저장소가 설정되지 않았어요.' });

	fastify.addContentTypeParser('application/gzip', { parseAs: 'buffer' }, (_request, body, done) => {
		done(null, body);
	});

	fastify.put<{ Params: { '*': string } }>('/v1/storage/transcripts/*', { bodyLimit: TRANSCRIPT_MAX_BYTES }, async (request, reply) => {
		if (!base || !authKey) return unavailable(reply);
		const key = request.params['*'];
		if (!TRANSCRIPT_KEY_PATTERN.test(key)) return reply.code(400).send({ error: 'transcript 키 형식이 올바르지 않아요.' });
		if (!Buffer.isBuffer(request.body) || request.body.length === 0) return reply.code(400).send({ error: '본문이 필요해요.' });

		try {
			const res = await fetch(`${base}/${TICKET_TRANSCRIPT_BUCKET}/${key}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/gzip', authorization: authKey },
				body: request.body,
				signal: AbortSignal.timeout(15_000)
			});
			if (!res.ok) {
				const detail = await res.text().catch(() => '');
				return reply
					.code(502)
					.send({ error: 'storage_write_failed', message: `저장소 업로드에 실패했어요. (${res.status}) ${detail.slice(0, 200)}` });
			}
			const saved = (await res.json().catch(() => ({}))) as { key?: unknown; size?: unknown };
			return reply.code(201).send({ key: typeof saved.key === 'string' ? saved.key : key, url: null });
		} catch {
			return reply.code(502).send({ error: 'storage_unreachable', message: '저장소에 연결하지 못했어요.' });
		}
	});

	fastify.get<{ Params: { '*': string } }>('/v1/storage/transcripts/*', async (request, reply) => {
		if (!base || !authKey) return unavailable(reply);
		const key = request.params['*'];
		if (!TRANSCRIPT_KEY_PATTERN.test(key)) return reply.code(400).send({ error: 'transcript 키 형식이 올바르지 않아요.' });

		try {
			const res = await fetch(`${base}/${TICKET_TRANSCRIPT_BUCKET}/${key}`, {
				headers: { authorization: authKey },
				signal: AbortSignal.timeout(15_000)
			});
			if (res.status === 404) return reply.code(404).send({ error: 'transcript_not_found', message: '대화 기록이 없어요.' });
			if (!res.ok) return reply.code(502).send({ error: 'storage_read_failed', message: '대화 기록을 불러오지 못했어요.' });
			const body = Buffer.from(await res.arrayBuffer());
			return reply.header('content-type', 'application/gzip').header('cache-control', 'no-store').send(body);
		} catch {
			return reply.code(502).send({ error: 'storage_unreachable', message: '저장소에 연결하지 못했어요.' });
		}
	});
}
