import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { PrismaClient, SocialSubscription } from '@sirubot/prisma';
import { socialSubscriptionCreateSchema, socialSubscriptionUpdateSchema, type SocialWebhookCreateRequest } from '@sirubot/utils';
import { captureSentryException } from '@sirubot/utils/sentry';
import { searchChzzkChannels, fetchChzzkChannelProfile, type FetchFn } from '../services/chzzkApi.ts';
import { SocialWebhookHub } from '../services/webhookHub.ts';
import { resolveYouTubeChannel } from '../services/youtubeWebSub.ts';
import { TwitchApiClient } from '../services/twitchApi.ts';
import { twitchSubscriptionStateKey } from '../services/twitchScheduler.ts';
import type { NotifierRedis } from '../services/redis.ts';
import { openWebhookToken, sealWebhookToken } from '../services/secretStorage.ts';
import { requireAuth } from '../plugins/auth.ts';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('social');

const GUILD_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const SUBSCRIPTION_ID_PATTERN = /^[0-9a-f-]{36}$/i;
const TWITCH_LOGIN_PATTERN = /^[a-zA-Z0-9_]{4,25}$/;
const WEBHOOK_DELETE_TIMEOUT_MS = 8_000;

type GuildParams = { Params: { guildId: string } };
type SubscriptionParams = { Params: { guildId: string; id: string } };

type SubscriptionRow = Omit<SocialSubscription, 'webhookId' | 'webhookToken'>;

export interface SocialRouteOptions {
	guard: ReturnType<typeof requireAuth>;
	getDb: () => PrismaClient | null;
	hub: SocialWebhookHub;
	twitchClient: TwitchApiClient | null;
	redis: NotifierRedis;
	fetchFn?: FetchFn;
}

function publicSubscription(row: SubscriptionRow) {
	return {
		id: row.id,
		guildId: row.guildId,
		platform: row.platform,
		sourcePlatformId: row.sourcePlatformId,
		sourceName: row.sourceName,
		targetChannelId: row.targetChannelId,
		messageTemplate: row.messageTemplate,
		webhookName: row.webhookName,
		webhookAvatarUrl: row.webhookAvatarUrl,
		showThumbnail: row.showThumbnail,
		status: row.status,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

function prismaErrorCode(error: unknown): string | null {
	if (error instanceof Error && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
		return (error as { code: string }).code;
	}
	return null;
}

function replyError(reply: FastifyReply, status: number, error: string, message: string) {
	reply.code(status);
	return reply.send({ error, message });
}

function replyInvalidParams(reply: FastifyReply, message: string) {
	return replyError(reply, 400, 'invalid_params', message);
}

function replyDbUnavailable(reply: FastifyReply) {
	return replyError(reply, 503, 'db_unavailable', 'DB 연결이 없어요.');
}

function replySubscriptionNotFound(reply: FastifyReply) {
	return replyError(reply, 404, 'subscription_not_found', '구독을 찾지 못했어요.');
}

/** Returns the rejection message for malformed subscription route params, or null when both IDs look valid. */
function subscriptionParamsError(guildId: string, id: string): string | null {
	if (!GUILD_ID_PATTERN.test(guildId)) return '길드 ID 형식이 올바르지 않아요.';
	if (!SUBSCRIPTION_ID_PATTERN.test(id)) return '구독 ID 형식이 올바르지 않아요.';
	return null;
}

function bodyText(body: unknown, field: string): string {
	return String((body as Record<string, unknown> | null | undefined)?.[field] ?? '').trim();
}

type ValidationIssue = { path: (string | number | symbol)[]; message: string };

// Duck-typed rather than instanceof: the schemas come from @sirubot/utils, which may resolve a different zod instance.
function hasValidationIssues(error: unknown): error is { issues: ValidationIssue[] } {
	return typeof error === 'object' && error !== null && 'issues' in error && Array.isArray((error as { issues: unknown }).issues);
}

async function sendError(reply: FastifyReply, error: unknown) {
	if (hasValidationIssues(error)) {
		return replyInvalidParams(reply, error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
	}
	captureSentryException(error);
	logger.error(error, '[notifier] social 라우트 처리 실패');
	return replyError(reply, 500, 'internal_error', '일시적인 오류예요. 잠시 후 다시 시도해 주세요.');
}

async function deleteDiscordWebhook(webhookId: string, webhookToken: string, fetchFn: FetchFn = fetch) {
	try {
		await fetchFn(`https://discord.com/api/webhooks/${webhookId}/${webhookToken}`, {
			method: 'DELETE',
			signal: AbortSignal.timeout(WEBHOOK_DELETE_TIMEOUT_MS)
		});
	} catch {}
}

export default async function subscriptionRoutes(fastify: FastifyInstance, options: SocialRouteOptions) {
	const { guard, getDb, hub, twitchClient, redis, fetchFn } = options;

	async function releaseTwitchEventSub(broadcasterId: string): Promise<void> {
		if (!twitchClient) return;
		const stateKey = twitchSubscriptionStateKey(broadcasterId);
		try {
			const raw = await redis.get(stateKey);
			if (!raw) return;
			const state = JSON.parse(raw) as { subscriptionId?: unknown };
			if (typeof state.subscriptionId !== 'string') return;
			if (await twitchClient.deleteSubscription(state.subscriptionId)) {
				await redis.del(stateKey);
				logger.info(`트위치 EventSub 구독 해지: ${broadcasterId} → ${state.subscriptionId}`);
			}
		} catch (error) {
			logger.warn(error, '[notifier] 트위치 EventSub 구독 정리 실패: Twitch 만료(약 10일)까지 남아요');
		}
	}

	fastify.get<GuildParams>('/v1/guilds/:guildId/social/subscriptions', { preHandler: guard }, async (request, reply) => {
		const { guildId } = request.params;
		if (!GUILD_ID_PATTERN.test(guildId)) return replyInvalidParams(reply, '길드 ID 형식이 올바르지 않아요.');
		const db = getDb();
		if (!db) return replyDbUnavailable(reply);
		try {
			const rows = await db.socialSubscription.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' } });
			return reply.send({ subscriptions: rows.map(publicSubscription) });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.post<GuildParams>('/v1/guilds/:guildId/social/subscriptions', { preHandler: guard }, async (request, reply) => {
		const { guildId } = request.params;
		const parsed = socialSubscriptionCreateSchema.safeParse({ ...(request.body as object), guildId });
		if (!parsed.success) return sendError(reply, parsed.error);
		const body = parsed.data;

		const db = getDb();
		if (!db) return replyDbUnavailable(reply);

		const hubRequest: SocialWebhookCreateRequest = {
			requestId: randomUUID(),
			guildId,
			targetChannelId: body.targetChannelId,
			name: body.webhookName ?? `시루 소셜 알림: ${body.sourceName}`.slice(0, 80)
		};
		const { webhookId, webhookToken, error: hubError } = await hub.requestWebhookCreate(hubRequest);
		if (hubError || !webhookId || !webhookToken) {
			return replyError(reply, 502, 'webhook_create_failed', hubError ?? '웹훅을 만들지 못했어요.');
		}

		try {
			const row = await db.socialSubscription.create({
				data: {
					guildId,
					platform: body.platform,
					sourcePlatformId: body.sourcePlatformId,
					sourceName: body.sourceName,
					targetChannelId: body.targetChannelId,
					messageTemplate: body.messageTemplate ?? null,
					webhookName: body.webhookName ?? null,
					webhookAvatarUrl: body.webhookAvatarUrl ?? null,
					showThumbnail: body.showThumbnail,
					webhookId,
					webhookToken: sealWebhookToken(webhookToken)
				}
			});
			return reply.send({ subscription: publicSubscription(row) });
		} catch (error) {
			void deleteDiscordWebhook(webhookId, webhookToken, fetchFn);
			if (prismaErrorCode(error) === 'P2002') {
				return replyError(reply, 409, 'duplicate_subscription', '이미 등록된 알림이에요.');
			}
			return sendError(reply, error);
		}
	});

	fastify.patch<SubscriptionParams>('/v1/guilds/:guildId/social/subscriptions/:id', { preHandler: guard }, async (request, reply) => {
		const { guildId, id } = request.params;
		const paramsError = subscriptionParamsError(guildId, id);
		if (paramsError) return replyInvalidParams(reply, paramsError);
		const parsed = socialSubscriptionUpdateSchema.safeParse(request.body ?? {});
		if (!parsed.success) return sendError(reply, parsed.error);

		const db = getDb();
		if (!db) return replyDbUnavailable(reply);
		try {
			// zod omits absent optional keys, so only the fields the caller sent are written.
			const row = await db.socialSubscription.update({ where: { id, guildId }, data: parsed.data });
			return reply.send({ subscription: publicSubscription(row) });
		} catch (error) {
			if (prismaErrorCode(error) === 'P2025') return replySubscriptionNotFound(reply);
			return sendError(reply, error);
		}
	});

	fastify.delete<SubscriptionParams>('/v1/guilds/:guildId/social/subscriptions/:id', { preHandler: guard }, async (request, reply) => {
		const { guildId, id } = request.params;
		const paramsError = subscriptionParamsError(guildId, id);
		if (paramsError) return replyInvalidParams(reply, paramsError);
		const db = getDb();
		if (!db) return replyDbUnavailable(reply);
		try {
			const row = await db.socialSubscription.findFirst({ where: { id, guildId } });
			if (!row) return replySubscriptionNotFound(reply);
			// Twitch EventSub 구독은 스트리머 단위라 공유돼요. 마지막 활성 구독일 때만 해지해요.
			const remainingTwitch =
				row.platform === 'twitch'
					? await db.socialSubscription.count({
							where: { platform: 'twitch', sourcePlatformId: row.sourcePlatformId, status: 'active', id: { not: row.id } }
						})
					: 0;
			await db.socialSubscription.delete({ where: { id } });
			void deleteDiscordWebhook(row.webhookId, openWebhookToken(row.webhookToken), fetchFn);
			if (row.platform === 'twitch' && remainingTwitch === 0) void releaseTwitchEventSub(row.sourcePlatformId);
			return reply.send({ ok: true });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.get('/v1/social/chzzk/search', { preHandler: guard }, async (request, reply) => {
		const query = (request.query ?? {}) as Record<string, string | undefined>;
		const keyword = (query.keyword ?? '').trim();
		if (keyword.length < 1 || keyword.length > 50) return replyInvalidParams(reply, '검색어는 1~50자로 입력해 주세요.');
		const offset = Number.parseInt(query.offset ?? '0', 10) || 0;
		const size = Math.min(Math.max(Number.parseInt(query.size ?? '10', 10) || 10, 1), 20);
		try {
			const channels = await searchChzzkChannels(keyword, offset, size, fetchFn);
			return reply.send({ channels });
		} catch (error) {
			logger.warn(error, '[notifier] 치지직 검색 실패');
			return replyError(reply, 502, 'chzzk_search_failed', '치지직 검색에 실패했어요. 잠시 후 다시 시도해 주세요.');
		}
	});

	fastify.post('/v1/social/chzzk/profile', { preHandler: guard }, async (request, reply) => {
		const channelId = bodyText(request.body, 'channelId');
		if (channelId.length < 8 || channelId.length > 64) return replyInvalidParams(reply, '치지직 채널 ID 형식이 올바르지 않아요.');
		try {
			const channel = await fetchChzzkChannelProfile(channelId, fetchFn);
			if (!channel) return replyError(reply, 404, 'chzzk_channel_not_found', '치지직 채널을 찾지 못했어요.');
			return reply.send({ channel });
		} catch (error) {
			logger.warn(error, '[notifier] 치지직 프로필 조회 실패');
			return replyError(reply, 502, 'chzzk_profile_failed', '치지직 채널 조회에 실패했어요. 잠시 후 다시 시도해 주세요.');
		}
	});

	fastify.post('/v1/social/youtube/resolve', { preHandler: guard }, async (request, reply) => {
		const input = bodyText(request.body, 'input');
		if (input.length < 1 || input.length > 200) return replyInvalidParams(reply, '유튜브 채널 입력은 1~200자로 해 주세요.');
		try {
			const channel = await resolveYouTubeChannel(input, fetchFn);
			if (!channel.channelId) return replyError(reply, 404, 'youtube_channel_not_found', '유튜브 채널을 찾지 못했어요.');
			return reply.send({ channelId: channel.channelId, channelName: channel.channelName });
		} catch (error) {
			logger.warn(error, '[notifier] 유튜브 채널 해석 실패');
			return replyError(reply, 502, 'youtube_resolve_failed', '유튜브 채널 확인에 실패했어요. 잠시 후 다시 시도해 주세요.');
		}
	});

	fastify.post('/v1/social/twitch/resolve', { preHandler: guard }, async (request, reply) => {
		const login = bodyText(request.body, 'login');
		if (!TWITCH_LOGIN_PATTERN.test(login)) return replyInvalidParams(reply, '트위치 로그인 아이디 형식이 아니에요.');
		if (!twitchClient) return replyError(reply, 503, 'twitch_not_configured', '트위치 연동이 설정되지 않았어요.');
		try {
			const user = await twitchClient.getTwitchUser(login);
			if (!user) return replyError(reply, 404, 'twitch_user_not_found', '트위치 사용자를 찾지 못했어요.');
			return reply.send({ id: user.id, login: user.login, displayName: user.displayName });
		} catch (error) {
			logger.warn(error, '[notifier] 트위치 사용자 해석 실패');
			return replyError(reply, 502, 'twitch_resolve_failed', '트위치 사용자 확인에 실패했어요. 잠시 후 다시 시도해 주세요.');
		}
	});
}
