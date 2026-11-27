import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SocialDispatcher } from '../services/dispatcher.ts';
import { parseYouTubeAtomFeed, verifyWebSubSignature } from '../services/youtubeWebSub.ts';

export default async function pubsubRoutes(fastify: FastifyInstance, options: { dispatcher: SocialDispatcher; hubSecret: string }): Promise<void> {
	fastify.get('/pubsub/youtube', async (request: FastifyRequest, reply: FastifyReply) => {
		const query = (request.query ?? {}) as Record<string, string | undefined>;
		const challenge = query['hub.challenge'];
		if (!challenge) return reply.code(400).send({ error: 'hub.challenge 파라미터가 없어요.' });
		return reply.code(200).type('text/plain').send(challenge);
	});

	// hub 타임아웃(구독 취소)을 막기 위해 dispatch는 비동기로 처리하고 즉시 200을 반환해요.
	fastify.post('/pubsub/youtube', async (request: FastifyRequest, reply: FastifyReply) => {
		if (!options.hubSecret) return reply.code(403).send({ error: 'WebSub 푸시가 비활성 상태예요.' });
		const raw = typeof request.body === 'string' ? request.body : '';
		const signature = request.headers['x-hub-signature'];
		const header = Array.isArray(signature) ? signature[0] : signature;
		if (!verifyWebSubSignature(raw, header, options.hubSecret)) {
			return reply.code(403).send({ error: '서명 검증에 실패했어요.' });
		}
		const { events } = parseYouTubeAtomFeed(raw);
		void (async () => {
			for (const event of events) await options.dispatcher.dispatch(event).catch(() => undefined);
		})();
		return reply.code(200).send({ ok: true });
	});
}
