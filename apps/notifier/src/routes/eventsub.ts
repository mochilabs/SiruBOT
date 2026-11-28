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

export async function eventsubRoutes(fastify: FastifyInstance, options: { dispatcher: SocialDispatcher; secret: string }): Promise<void> {
	// HMAC 서명 검증에 raw JSON 본문이 필요해요.
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
					const challenge = envelope.challenge;
					if (typeof challenge !== 'string') return reply.code(400).send({ error: 'challenge가 없어요.' });
					return reply.code(200).send(challenge);
				}
				case 'notification': {
					if (envelope.subscription?.type === 'stream.online') {
						const event = envelope.event;
						// 200을 반환하지 않으면 Twitch가 계속 재전송하므로 필드 결손 시에도 200으로 응답해요.
						if (isStreamOnlineEvent(event)) {
							void options.dispatcher.dispatch(normalizeStreamOnline(event)).catch((error: unknown) => {
								logger.warn('stream.online 디스패치 실패:', String(error));
							});
						} else {
							logger.warn('stream.online 이벤트 필드가 불완전해요. 알림을 건너뛸게요.');
						}
					}
					return reply.code(200).send({ ok: true });
				}
				case 'revocation': {
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
