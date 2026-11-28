import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PLAYER_WEB_SEEK_MAX_MS, playerWebControlActionSchema, playerWebPlayUriSchema, redisIdSchema } from '@sirubot/utils';
import { metrics } from '../utils/metrics.ts';
import { sendError, guildIdParams, playerUserIdSchema, replyBotRelayFailure, type ReplySink } from './common.ts';
import { searchLavalinkYoutube } from '../providers/lavalinkSearch.ts';
import { recordPlaybackEvent, type PlaybackEventType } from '../services/playbackStore.ts';
import { getPlayerState, playerHubStatus, subscribeSse } from '../services/playerHub.ts';
import { requestPlayerWeb, type PlayerWebResult } from '../services/playerWebHub.ts';

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

	const playbackEventSchema = z.object({
		type: z.enum(['track_start', 'track_end', 'track_stuck', 'track_error', 'queue_end', 'playback_abort', 'node_disconnect', 'node_error']),
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

	fastify.get('/v1/player/:guildId/stream', async (request, reply) => {
		// Validate before hijack() so ZodError returns 400 instead of an unhandled 500.
		let guildId: string;
		try {
			({ guildId } = guildIdParams.parse(request.params));
		} catch (error) {
			sendError(reply, error);
			return;
		}
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

		send(JSON.stringify({ player: getPlayerState(guildId), hub: playerHubStatus() }));

		const unsubscribe = subscribeSse(guildId, send);
		const keepalive = setInterval(() => {
			try {
				raw.write(': keepalive\n\n');
			} catch {}
		}, 15_000);

		raw.once('close', () => {
			clearInterval(keepalive);
			unsubscribe();
		});
	});

	const playerWebSearchSchema = z.object({
		guildId: redisIdSchema,
		userId: playerUserIdSchema,
		query: z.string().trim().min(1).max(200)
	});
	const playerWebPlaySchema = z.object({
		guildId: redisIdSchema,
		userId: playerUserIdSchema,
		// Enforce http/https only to prevent Lavalink SSRF.
		uri: playerWebPlayUriSchema
	});
	const playerWebControlSchema = z.object({
		guildId: redisIdSchema,
		userId: playerUserIdSchema,
		action: playerWebControlActionSchema,
		value: z.number().int().min(0).max(150).optional(),
		index: z.number().int().min(0).max(999).optional(),
		from: z.number().int().min(0).max(999).optional(),
		to: z.number().int().min(0).max(999).optional(),
		positionMs: z.number().int().min(0).max(PLAYER_WEB_SEEK_MAX_MS).optional()
	});
	const playerVoiceContextQuery = z.object({ userId: playerUserIdSchema });

	function replyPlayerWebResult(reply: ReplySink, result: PlayerWebResult): unknown {
		if (result.ok) {
			return reply.send({ ok: true, tracks: result.tracks ?? null, voice: result.voice ?? null });
		}
		return replyBotRelayFailure(reply, result.reason, {
			code: result.code ?? 'web_player_rejected',
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
			const { guildId, userId, action, value, index, from, to, positionMs } = playerWebControlSchema.parse(request.body);
			const result = await requestPlayerWeb({
				requestId: crypto.randomUUID(),
				guildId,
				userId,
				kind: 'control',
				action,
				...(value !== undefined ? { value } : {}),
				...(index !== undefined ? { index } : {}),
				...(from !== undefined ? { from } : {}),
				...(to !== undefined ? { to } : {}),
				...(positionMs !== undefined ? { positionMs } : {})
			});
			metrics.request('player-web-control');
			return replyPlayerWebResult(reply, result);
		} catch (error) {
			return sendError(reply, error);
		}
	});

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
