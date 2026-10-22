import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { playerWebControlActionSchema, playerWebPlayUriSchema, redisIdSchema } from '@sirubot/utils';
import { metrics } from '../utils/metrics.ts';
import { sendError, guildIdParams, playerUserIdSchema, replyBotRelayFailure } from './common.ts';
import { searchLavalinkYoutube } from '../providers/lavalinkSearch.ts';
import { recordPlaybackEvent, recentPlaybackEvents, type PlaybackEventType } from '../services/playbackStore.ts';
import { getPlayerState, playerHubStatus, subscribeSse } from '../services/playerHub.ts';
import { requestPlayerWeb, type PlayerWebResult } from '../services/playerWebHub.ts';

/** 음악 재생 도메인 — 재생 이벤트 수집, 라이브 플레이어 상태/SSE, Lavalink YouTube 검색, 웹 플레이어 request/reply 프록시. */

export function registerPlayerRoutes(fastify: FastifyInstance, deps: { lavalinkRestUrl?: string; lavalinkPassword?: string }): void {
	fastify.get('/v1/youtube/search', async (request, reply) => {
		const parsed = z.object({ query: z.string().trim().min(1).max(200) }).safeParse(request.query);
		if (!parsed.success) return reply.code(400).send({ error: 'invalid_query', message: '검색어는 1~200자까지 입력해 주세요.' });
		if (!deps.lavalinkRestUrl || !deps.lavalinkPassword) {
			return reply.code(503).send({ error: 'lavalink_not_configured', message: 'YouTube 검색이 아직 설정되지 않았어요.' });
		}

		try {
			const tracks = await searchLavalinkYoutube(deps.lavalinkRestUrl, deps.lavalinkPassword, parsed.data.query);
			return { tracks };
		} catch {
			return reply.code(502).send({
				error: 'lavalink_search_failed',
				message: 'YouTube 검색을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.'
			});
		}
	});

	// ── 재생 이벤트 수집 (봇 trackHandler → fire-and-forget) ──
	const playbackEventSchema = z.object({
		type: z.enum(['track_start', 'track_end', 'track_stuck', 'track_error', 'queue_end', 'playback_abort', 'node_disconnect', 'node_error']),
		// 노드 이벤트는 길드가 아니라 음성 서버 단위라 guildId가 없어요. nodeId로 식별해요.
		guildId: redisIdSchema.nullable().default(null),
		nodeId: z.string().max(100).nullable().default(null),
		shardId: z.number().int().min(0).nullable().default(null),
		trackTitle: z.string().max(500).nullable().default(null),
		trackAuthor: z.string().max(500).nullable().default(null),
		trackId: z.string().max(200).nullable().default(null),
		reason: z.string().max(200).nullable().default(null),
		consecutiveErrors: z.number().int().min(0).max(100).default(0)
	});
	fastify.post('/v1/playback/events', async (request, reply) => {
		try {
			const body = playbackEventSchema.parse(request.body);
			recordPlaybackEvent({ ...body, type: body.type as PlaybackEventType, at: Date.now() });
			return reply.send({ ok: true });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.get('/v1/playback/recent', async (request, reply) => {
		try {
			const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(request.query);
			return reply.send({ events: recentPlaybackEvents(query.limit) });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 라이브 플레이어 상태 (봇 Redis Pub/Sub → playerHub) ──
	// 알 수 없는 길드/전송 중지 길드도 404 대신 player:null + hub 상태로 응답해요 — dashboard SWR 폴백이 안정적으로 동작하게.
	fastify.get('/v1/player/:guildId', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			return reply.send({
				player: getPlayerState(guildId),
				hub: playerHubStatus()
			});
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 라이브 플레이어 상태 SSE — Redis Pub/Sub 구독을 즉시 relay해요 ──
	fastify.get('/v1/player/:guildId/stream', async (request, reply) => {
		// 파라미터 검증 실패는 hijack 전에 400으로 내려요 — hijack 후에는 HTTP 응답을 보낼 수 없고
		// ZodError가 Fastify 기본 핸들러로 가 500(내부 스택 노출)이 돼요.
		let guildId: string;
		try {
			({ guildId } = guildIdParams.parse(request.params));
		} catch (error) {
			return sendError(reply, error);
		}
		// SSE는 응답 수명을 직접 관리하므로 Fastify 라이프사이클(타임아웃/자동 종료)에서 분리해요.
		reply.hijack();
		const raw = reply.raw;
		raw.writeHead(200, {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		});
		raw.write('retry: 3000\n\n');

		const send = (payload: string): void => {
			raw.write(`event: state\ndata: ${payload}\n\n`);
		};

		// 현재 상태 1회 즉시 전송 (없으면 player:null)
		send(JSON.stringify({ player: getPlayerState(guildId), hub: playerHubStatus() }));

		const unsubscribe = subscribeSse(guildId, send);
		// 킵얼라이브 — 프록시/방화벽 타임아웃 방지
		const keepalive = setInterval(() => {
			try {
				raw.write(': keepalive\n\n');
			} catch {
				// noop
			}
		}, 15_000);

		raw.once('close', () => {
			clearInterval(keepalive);
			unsubscribe();
		});
	});

	// ── 웹 플레이어 request/reply (대시보드 검색·재생·제어·음성 상태 → 봇 → 응답 상관) ──
	// 요청자의 음성 채널과 관리자/DJ 권한은 봇 캐시로만 해석할 수 있으므로 userId까지 전달해요.
	// REQUEST 채널로 퍼블리시한 뒤 kind별 대기 시간(playerWebHub KIND_TIMEOUT_MS) 안에 RESPONSE 채널 응답을
	// 상관해 내려줘요. Redis 없으면 503, 봇이 시간 안에 응답하지 않으면(봇 미보유·미연결 포함) 502,
	// 봇이 검증 실패 사유(음성 미접속·권한 없음·노드 없음 등)를 실어 보내면 400으로 그 문구를 그대로 전달해요.
	const playerWebSearchSchema = z.object({
		guildId: redisIdSchema,
		userId: playerUserIdSchema,
		query: z.string().trim().min(1).max(200)
	});
	const playerWebPlaySchema = z.object({
		guildId: redisIdSchema,
		userId: playerUserIdSchema,
		// http/https 전용 — 다른 스킴은 Lavalink 측 내부 fetch(SSRF)로 이어질 수 있어 공용 계약 스키마로 막아요.
		uri: playerWebPlayUriSchema
	});
	const playerWebControlSchema = z.object({
		guildId: redisIdSchema,
		userId: playerUserIdSchema,
		action: playerWebControlActionSchema,
		value: z.number().int().min(0).max(150).optional()
	});
	const playerVoiceContextQuery = z.object({ userId: playerUserIdSchema });

	/** PlayerWebResult를 HTTP로 매핑 — 성공은 필드를 그대로, 실패는 공통부(replyBotRelayFailure)로 내려줘요 */
	function replyPlayerWebResult(reply: { code: (n: number) => any; send: (body: unknown) => any }, result: PlayerWebResult): any {
		if (result.ok) {
			return reply.send({ ok: true, tracks: result.tracks ?? null, voice: result.voice ?? null });
		}
		// 봇이 검증 실패(음성 미접속·권한 없음 등)를 실어 보낸 경우 — 사용자가 고칠 수 있는 행동이므로 400
		return replyBotRelayFailure(reply, result.reason, {
			code: 'web_player_rejected',
			message: result.message,
			fallback: '요청을 처리하지 못했어요.'
		});
	}

	fastify.post('/v1/internal/player/search', async (request, reply) => {
		try {
			const { guildId, userId, query } = playerWebSearchSchema.parse(request.body);
			const result = await requestPlayerWeb({
				requestId: crypto.randomUUID(),
				guildId,
				userId,
				kind: 'search',
				query
			});
			metrics.request('player-web-search');
			return replyPlayerWebResult(reply, result);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.post('/v1/internal/player/play', async (request, reply) => {
		try {
			const { guildId, userId, uri } = playerWebPlaySchema.parse(request.body);
			const result = await requestPlayerWeb({
				requestId: crypto.randomUUID(),
				guildId,
				userId,
				kind: 'play',
				uri
			});
			metrics.request('player-web-play');
			return replyPlayerWebResult(reply, result);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.post('/v1/internal/player/control', async (request, reply) => {
		try {
			const { guildId, userId, action, value } = playerWebControlSchema.parse(request.body);
			const result = await requestPlayerWeb({
				requestId: crypto.randomUUID(),
				guildId,
				userId,
				kind: 'control',
				action,
				...(value !== undefined ? { value } : {})
			});
			metrics.request('player-web-control');
			return replyPlayerWebResult(reply, result);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 요청자 음성·권한 상태 조회 (player 페이지 배지) ──
	fastify.get('/v1/player/:guildId/voice-context', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			const { userId } = playerVoiceContextQuery.parse(request.query);
			const result = await requestPlayerWeb({
				requestId: crypto.randomUUID(),
				guildId,
				userId,
				kind: 'voice-context'
			});
			metrics.request('player-web-voice-context');
			return replyPlayerWebResult(reply, result);
		} catch (error) {
			return sendError(reply, error);
		}
	});
}
