import type { FastifyInstance } from 'fastify';
import type { SocialEvent } from '@sirubot/utils';
import type { SocialDispatcher } from '../services/dispatcher.ts';
import { isEventSubTimestampFresh, verifyEventSubSignature } from '../services/twitchApi.ts';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('eventsub');

interface StreamOnlineEvent {
	id: string;
	broadcaster_user_id: string;
	broadcaster_user_login: string;
	broadcaster_user_name: string;
	started_at: string;
}

/**
 * 트위치 EventSub 공개 콜백 (무인증): HMAC 서명 검증이 인증을 대신해요.
 * POST /eventsub/twitch
 */
export async function eventsubRoutes(fastify: FastifyInstance, options: { dispatcher: SocialDispatcher; secret: string }): Promise<void> {
	// HMAC 검증에 raw 본문이 필요해요. 이 스코프에서만 JSON을 string으로 받아요.
	// (register로 캡슐화했으니 다른 라우트의 JSON 파서엔 영향이 없어요.)
	await fastify.register(async (scope) => {
		scope.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => done(null, body));

		scope.post('/eventsub/twitch', async (request, reply) => {
			const raw = typeof request.body === 'string' ? request.body : '';
			const messageId = String(request.headers['twitch-eventsub-message-id'] ?? '');
			const messageTimestamp = String(request.headers['twitch-eventsub-message-timestamp'] ?? '');
			const signature = String(request.headers['twitch-eventsub-message-signature'] ?? '');
			const messageType = String(request.headers['twitch-eventsub-message-type'] ?? '');

			if (!options.secret) {
				return reply.code(403).send({ error: '트위치 EventSub 푸시가 비활성 상태예요.' });
			}
			if (!messageId || !messageTimestamp || !signature) {
				return reply.code(400).send({ error: 'EventSub 헤더가 누락됐어요.' });
			}
			// 리플레이 가드: 10분 이상 지난 메시지는 서명이 유효해도 버려요.
			if (!isEventSubTimestampFresh(messageTimestamp)) {
				return reply.code(403).send({ error: '메시지 시간이 너무 오래됐어요.' });
			}
			if (!verifyEventSubSignature(raw, messageId, messageTimestamp, signature, options.secret)) {
				return reply.code(403).send({ error: '서명이 올바르지 않아요.' });
			}

			let envelope: { challenge?: unknown; subscription?: { type?: string; status?: string }; event?: Record<string, unknown> };
			try {
				envelope = JSON.parse(raw);
			} catch {
				return reply.code(400).send({ error: '본문 파싱에 실패했어요.' });
			}

			switch (messageType) {
				case 'webhook_callback_verification': {
					// 구독 생성 직후 오는 검증 메시지: challenge 원문을 그대로 echo해요.
					const challenge = envelope.challenge;
					if (typeof challenge !== 'string') return reply.code(400).send({ error: 'challenge가 없어요.' });
					return reply.code(200).send(challenge);
				}
				case 'notification': {
					if (envelope.subscription?.type === 'stream.online') {
						const event = envelope.event;
						// 검증된 발신이지만 필드 결손은 조용히 넘겨요. 200을 안 보내면 hub가 계속 재전송해요.
						if (isStreamOnlineEvent(event)) {
							void (async () => {
								try {
									await options.dispatcher.dispatch(normalizeStreamOnline(event));
								} catch (error) {
									logger.warn('stream.online 디스패치 실패:', String(error));
								}
							})();
						} else {
							logger.warn('stream.online 이벤트 필드가 불완전해요. 알림을 건너뛸게요.');
						}
					}
					return reply.code(200).send({ ok: true });
				}
				case 'revocation': {
					// 구독 해지 통보: 대시보드에서 상태로 보이게 로그만 남겨요 (2차: 구독 상태 반영).
					logger.warn(`트위치 구독이 해지됐어요. ${envelope.subscription?.type ?? '알 수 없음'}`);
					return reply.code(200).send({ ok: true });
				}
				default:
					return reply.code(200).send({ ok: true });
			}
		});
	});
}

function isStreamOnlineEvent(event: unknown): event is StreamOnlineEvent {
	if (typeof event !== 'object' || event === null) return false;
	const candidate = event as Record<string, unknown>;
	return (
		typeof candidate.id === 'string' &&
		typeof candidate.broadcaster_user_id === 'string' &&
		typeof candidate.broadcaster_user_login === 'string' &&
		typeof candidate.broadcaster_user_name === 'string' &&
		typeof candidate.started_at === 'string'
	);
}

/** stream.online → SocialEvent 정규화: 썸네일은 1차에 null (별도 Get Streams 호출이 필요해요). */
function normalizeStreamOnline(event: StreamOnlineEvent): SocialEvent {
	return {
		platform: 'twitch',
		sourceId: event.broadcaster_user_id,
		contentId: event.id,
		title: `${event.broadcaster_user_name} 방송 시작!`,
		url: `https://www.twitch.tv/${event.broadcaster_user_login}`,
		thumbnail: null,
		author: event.broadcaster_user_name,
		publishedAt: Date.parse(event.started_at) || Date.now()
	};
}
