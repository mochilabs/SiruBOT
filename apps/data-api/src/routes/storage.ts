import type { FastifyInstance, FastifyReply } from 'fastify';
import { TICKET_TRANSCRIPT_BUCKET } from '@sirubot/utils';

/**
 * storage 프록시 — 봇·대시보드는 스토리지 주소·키를 몰라도 돼요(data-api만 보유).
 *
 * 용도: 티켓 대화 기록(transcript) 업로드/다운로드. 버킷은 **비공개 버킷 하나로 고정**해
 * 임의 버킷 쓰기를 허용하지 않아요. 키는 `{guildId}/{ticketId}.json.gz` 규칙만 통과해요.
 * 공개 버킷(`guild-assets`)은 기존처럼 대시보드가 storage에 직접 접근해요.
 */

const TRANSCRIPT_KEY_PATTERN = /^\d{17,20}\/[0-9a-f-]{36}\.json\.gz$/;
const TRANSCRIPT_MAX_BYTES = 16 * 1024 * 1024;

export interface StorageProxyDeps {
	/** storage base URL — 미설정이면 라우트가 503으로 응답해요 */
	storageUrl?: string;
	/** storage 인증 키 (Authorization 헤더 원문, Bearer 없음) */
	storageAuthKey?: string;
}

export function registerStorageProxyRoutes(fastify: FastifyInstance, deps: StorageProxyDeps): void {
	const base = deps.storageUrl?.replace(/\/+$/, '');
	const authKey = deps.storageAuthKey ?? '';

	const unavailable = (reply: FastifyReply) => reply.code(503).send({ error: 'storage_unavailable', message: '저장소가 설정되지 않았어요.' });

	// gzip 바이트를 그대로 받아요 (본문 파서는 raw buffer)
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
