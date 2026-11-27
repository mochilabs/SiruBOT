import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
	GUILD_SETTINGS_INVALIDATE_CHANNEL,
	BOT_PROFILE_SET_CHANNEL,
	MEMBER_GREETING_SEND_CHANNEL,
	botProfilePendingKey,
	memberGreetingPendingKey,
	redisIdSchema
} from '@sirubot/utils';
import { resolveRedisSigningKey, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { sharedCache } from '../utils/cache.ts';
import { metrics } from '../utils/metrics.ts';
import { sendError, guildIdParams, playerUserIdSchema, replyBotRelayFailure, type ReplySink } from './common.ts';
import { DataApiError } from './serveCached.ts';
import { getBotProfile, botProfileHubStatus, refreshBotProfile } from '../services/botProfileHub.ts';
import { getGreetingTestResult } from '../services/memberGreetingHub.ts';
import { requestGuildData, type GuildDataFailureReason } from '../services/guildDataHub.ts';
import { requestJtcSetup, type JtcSetupResult } from '../services/jtcSetupHub.ts';

function replyGuildDataFailure(reply: ReplySink, reason: GuildDataFailureReason): unknown {
	return replyBotRelayFailure(reply, reason, { code: 'guild_data_rejected', message: null, fallback: '' });
}

function requireRedisClient(reply: ReplySink, message: string): NonNullable<ReturnType<typeof sharedCache.getClient>> | null {
	const client = sharedCache.getClient();
	if (!client) {
		reply.code(503).send({ error: 'redis_unavailable', message });
		return null;
	}
	return client;
}

async function claimPendingSlot(
	client: NonNullable<ReturnType<typeof sharedCache.getClient>>,
	key: string,
	payload: string,
	ttlSeconds: number,
	conflict: { code: string; message: string }
): Promise<void> {
	const acquired = await client.set(key, payload, { EX: ttlSeconds, NX: true });
	if (acquired === null) throw new DataApiError(409, conflict.code, conflict.message);
}

export function registerGuildDataRoutes(fastify: FastifyInstance): void {
	fastify.get('/v1/bot-profile/:guildId', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			const refreshed = await refreshBotProfile(guildId);
			return reply.send({
				profile: getBotProfile(guildId),
				hub: botProfileHubStatus(),
				refreshFailed: !refreshed
			});
		} catch (error) {
			return sendError(reply, error);
		}
	});

	const invalidateSchema = z.object({
		guildId: redisIdSchema,
		reason: z.enum(['mixer', 'panel']).optional()
	});
	fastify.post('/v1/internal/guild-settings/invalidate', async (request, reply) => {
		try {
			const { guildId, reason } = invalidateSchema.parse(request.body);
			const client = requireRedisClient(reply, '무효화 브로드캐스트를 위해 Redis가 필요해요.');
			if (!client) return reply;
			await client.publish(GUILD_SETTINGS_INVALIDATE_CHANNEL, JSON.stringify(reason ? { guildId, reason } : { guildId }));
			metrics.request('guild-settings-invalidate');
			return reply.send({ ok: true });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	const jtcSetupRequestBody = z.object({
		guildId: redisIdSchema,
		userId: playerUserIdSchema,
		categoryId: redisIdSchema,
		markerChannelName: z.string().trim().min(1).max(100).optional()
	});

	function replyJtcSetupResult(reply: ReplySink, result: JtcSetupResult): unknown {
		if (result.ok) {
			return reply.send({ ok: true, markerChannelId: result.markerChannelId ?? null });
		}
		return replyBotRelayFailure(reply, result.reason, {
			code: 'jtc_setup_rejected',
			message: result.message,
			fallback: '임시 방 마커 채널을 준비하지 못했어요.'
		});
	}

	fastify.post('/v1/internal/jtc/setup', async (request, reply) => {
		try {
			const { guildId, userId, categoryId, markerChannelName } = jtcSetupRequestBody.parse(request.body);
			const result = await requestJtcSetup({
				requestId: crypto.randomUUID(),
				guildId,
				userId,
				categoryId,
				...(markerChannelName ? { markerChannelName } : {})
			});
			metrics.request('jtc-setup');
			return replyJtcSetupResult(reply, result);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	const botProfileSetSchema = z
		.object({
			guildId: redisIdSchema,
			nickname: z.string().max(32).nullable().optional(),
			avatar: z.union([z.string().startsWith('data:image/').max(5_500_000), z.null()]).optional(),
			banner: z.union([z.string().startsWith('data:image/').max(5_500_000), z.null()]).optional()
		})
		.refine((body) => 'nickname' in body || 'avatar' in body || 'banner' in body, { message: '변경할 프로필 항목이 없어요.' });
	const BOT_PROFILE_PENDING_TTL_SECONDS = 120;

	const redisSigningKey = resolveRedisSigningKey(process.env);

	fastify.post('/v1/internal/bot-profile/set', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
		try {
			const body = botProfileSetSchema.parse(request.body);
			const guildId = body.guildId;
			const payload: Record<string, string | null> = {};
			if ('nickname' in body && body.nickname !== undefined) {
				const nickname = body.nickname === null ? null : body.nickname.trim();
				payload.nickname = nickname !== null && nickname.length > 0 ? nickname : null;
			}
			if ('avatar' in body && body.avatar !== undefined) {
				payload.avatar = body.avatar;
			}
			if ('banner' in body && body.banner !== undefined) {
				payload.banner = body.banner;
			}

			const client = requireRedisClient(reply, '봇 프로필 적용을 위해 Redis가 필요해요.');
			if (!client) return reply;
			// Reject concurrent updates with 409 before the bot consumes the NX pending key.
			await claimPendingSlot(
				client,
				botProfilePendingKey(guildId),
				wrapRedisMessage(redisSigningKey, payload),
				BOT_PROFILE_PENDING_TTL_SECONDS,
				{ code: 'bot_profile_pending_conflict', message: '이전 프로필 적용 요청이 아직 처리 중이에요. 잠시 후 다시 시도해 주세요.' }
			);
			await client.publish(BOT_PROFILE_SET_CHANNEL, wrapRedisMessage(redisSigningKey, { guildId }));
			metrics.request('bot-profile-set');
			return reply.send({ ok: true });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	const greetingSendSchema = z.object({
		guildId: redisIdSchema,
		kind: z.enum(['welcome', 'goodbye']),
		userId: redisIdSchema
	});
	const GREETING_PENDING_TTL_SECONDS = 120;

	fastify.post('/v1/internal/greeting/send', async (request, reply) => {
		try {
			const body = greetingSendSchema.parse(request.body);
			const client = requireRedisClient(reply, '인사 테스트 전송을 위해 Redis가 필요해요.');
			if (!client) return reply;
			const requestId = crypto.randomUUID();
			// Reject concurrent sends with 409; overwriting would drop the first requestId's reply.
			await claimPendingSlot(
				client,
				memberGreetingPendingKey(body.guildId),
				wrapRedisMessage(redisSigningKey, { kind: body.kind, userId: body.userId, requestId }),
				GREETING_PENDING_TTL_SECONDS,
				{ code: 'greeting_pending_conflict', message: '이전 인사 테스트 요청이 아직 처리 중이에요. 잠시 후 다시 시도해 주세요.' }
			);
			await client.publish(MEMBER_GREETING_SEND_CHANNEL, wrapRedisMessage(redisSigningKey, { guildId: body.guildId, requestId }));
			metrics.request('greeting-send');
			return reply.send({ ok: true, requestId });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.get('/v1/greeting/state/:guildId', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			return reply.send(getGreetingTestResult(guildId));
		} catch (error) {
			return sendError(reply, error);
		}
	});

	const registerGuildListRoute = (path: string, kind: 'channels' | 'roles') => {
		fastify.get(path, async (request, reply) => {
			try {
				const { guildId } = guildIdParams.parse(request.params);
				const result = await requestGuildData(guildId, kind);
				if (!result.ok) return replyGuildDataFailure(reply, result.reason);
				metrics.request(`guild-data-${kind}`);
				return reply.send({ [kind]: result[kind] ?? [] });
			} catch (error) {
				return sendError(reply, error);
			}
		});
	};
	registerGuildListRoute('/v1/guilds/:guildId/channels', 'channels');
	registerGuildListRoute('/v1/guilds/:guildId/roles', 'roles');

	const membersQuery = z.object({ userIds: z.string().trim().min(1).max(400) });
	fastify.get('/v1/guilds/:guildId/members', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			const { userIds } = membersQuery.parse(request.query);
			const parsedUserIds = z.array(redisIdSchema).min(1).max(10).parse(userIds.split(','));
			const result = await requestGuildData(guildId, 'members', parsedUserIds);
			if (!result.ok) return replyGuildDataFailure(reply, result.reason);
			metrics.request('guild-data-members');
			return reply.send({ members: result.members ?? [] });
		} catch (error) {
			return sendError(reply, error);
		}
	});
}
