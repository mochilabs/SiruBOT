import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SocialDispatcher } from '../services/dispatcher.ts';
import { parseYouTubeAtomFeed, verifyWebSubSignature } from '../services/youtubeWebSub.ts';

/**
 * 소셜 플랫폼 공개 콜백 라우트: 무인증이에요.
 * 인증은 프로토콜 자체가 대신해요. WebSub은 challenge echo + X-Hub-Signature HMAC, EventSub은 challenge + HMAC.
 * (data-api의 SEC-010 원칙: 무인증 표면은 이 라우트와 /health뿐)
 */
export default async function pubsubRoutes(fastify: FastifyInstance, options: { dispatcher: SocialDispatcher; hubSecret: string }): Promise<void> {
	// 유튜브 WebSub: hub가 구독 검증용 challenge를 보내면 그대로 echo해요 (스펙).
	fastify.get('/pubsub/youtube', async (request: FastifyRequest, reply: FastifyReply) => {
		const query = (request.query ?? {}) as Record<string, string | undefined>;
		const challenge = query['hub.challenge'];
		if (!challenge) return reply.code(400).send({ error: 'hub.challenge 파라미터가 없어요.' });
		return reply.code(200).type('text/plain').send(challenge);
	});

	// 유튜브 WebSub: 콘텐츠 콜백. 서명 검증 후 파싱·dispatch는 비동기로 돌리고 빨리 200을 돌려줘요
	// (hub는 재전송이 없어서 2xx가 늦으면 검증 타임아웃으로 구독이 취소될 수 있어요. 중복 방어는 dedup가 해요).
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
