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
import { requireAuth } from '../plugins/auth.ts';
import { getLogger } from '../utils/logger.ts';

import { openWebhookToken, sealWebhookToken } from '../services/secretStorage.ts';

const logger = getLogger('social');

/** 공개 응답에서 빼는 필드: webhookId/webhookToken은 대시보드에 절대 노출하지 않아요. */
type SubscriptionRow = Omit<SocialSubscription, 'webhookId' | 'webhookToken'>;

export interface SocialRouteOptions {
	guard: ReturnType<typeof requireAuth>;
	getDb: () => PrismaClient | null;
	hub: SocialWebhookHub;
	twitchClient: TwitchApiClient | null;
	/** 트위치 EventSub 구독 상태 키 정리용: twitchScheduler와 같은 Redis를 써요. */
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

async function sendError(reply: FastifyReply, error: unknown) {
	if (error && typeof error === 'object' && 'issues' in error && Array.isArray((error as { issues: unknown[] }).issues)) {
		const issues = (error as { issues: { path: (string | number | symbol)[]; message: string }[] }).issues;
		reply.code(400);
		return reply.send({
			error: 'invalid_params',
			message: issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
		});
	}
	// 예측 못 한 내부 오류: 앱 로거(로거:false인 Fastify의 reply.log는 no-op이라 유실됨)와 Sentry에 남겨요.
	captureSentryException(error);
	logger.error(error, '[notifier] social 라우트 처리 실패');
	reply.code(500);
	return reply.send({ error: 'internal_error', message: '일시적인 오류예요. 잠시 후 다시 시도해 주세요.' });
}

async function deleteDiscordWebhook(webhookId: string, webhookToken: string, fetchFn: FetchFn = fetch) {
	try {
		await fetchFn(`https://discord.com/api/webhooks/${webhookId}/${webhookToken}`, {
			method: 'DELETE',
			signal: AbortSignal.timeout(8_000)
		});
	} catch {
		// 정리 실패는 무시해요. 고아 웹훅은 디스코드가 주기적으로 치워요.
	}
}

export default async function subscriptionRoutes(fastify: FastifyInstance, options: SocialRouteOptions) {
	const { guard, getDb, hub, twitchClient, redis, fetchFn } = options;

	/**
	 * Twitch EventSub 구독 정리: 스트리머 단위 구독이라 다른 길드가 아직 활성 구독이면 호출하지 않아요.
	 * 구독 ID는 twitchScheduler가 Redis 상태 키에 남기므로 그 키를 열어 즉시 해지하고, 정리 실패는
	 * best-effort예요 (약 10일 뒤 Twitch 쪽에서 저절로 만료돼요).
	 */
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

	fastify.get('/v1/guilds/:guildId/social/subscriptions', { preHandler: guard }, async (request, reply) => {
		const guildId = (request.params as { guildId: string }).guildId;
		if (!/^[a-zA-Z0-9_-]+$/.test(guildId)) {
			reply.code(400);
			return reply.send({ error: 'invalid_params', message: '길드 ID 형식이 올바르지 않아요.' });
		}
		const db = getDb();
		if (!db) {
			reply.code(503);
			return reply.send({ error: 'db_unavailable', message: 'DB 연결이 없어요.' });
		}
		try {
			const rows = await db.socialSubscription.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' } });
			return reply.send({ subscriptions: rows.map(publicSubscription) });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.post('/v1/guilds/:guildId/social/subscriptions', { preHandler: guard }, async (request, reply) => {
		const guildId = (request.params as { guildId: string }).guildId;
		const parsed = socialSubscriptionCreateSchema.safeParse({ ...(request.body as object), guildId });
		if (!parsed.success) return sendError(reply, parsed.error);
		const body = parsed.data;

		const db = getDb();
		if (!db) {
			reply.code(503);
			return reply.send({ error: 'db_unavailable', message: 'DB 연결이 없어요.' });
		}

		const hubRequest: SocialWebhookCreateRequest = {
			requestId: randomUUID(),
			guildId,
			targetChannelId: body.targetChannelId,
			// 커스텀 표시명이 있으면 웹훅 자체의 이름으로도 반영하고, 없으면 기본 이름을 만들어요.
			name: body.webhookName ?? `시루 소셜 알림: ${body.sourceName}`.slice(0, 80)
		};
		const hubResponse = await hub.requestWebhookCreate(hubRequest);
		if (hubResponse.error || !hubResponse.webhookId || !hubResponse.webhookToken) {
			reply.code(502);
			return reply.send({ error: 'webhook_create_failed', message: hubResponse.error ?? '웹훅을 만들지 못했어요.' });
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
					webhookId: hubResponse.webhookId,
					// 저장 직전 암호화 — DB에는 크리덴셜 평문을 두지 않아요 (키 없으면 평문 폴백)
					webhookToken: sealWebhookToken(hubResponse.webhookToken)
				}
			});
			return reply.send({ subscription: publicSubscription(row) });
		} catch (error) {
			if (prismaErrorCode(error) === 'P2002') {
				void deleteDiscordWebhook(hubResponse.webhookId!, hubResponse.webhookToken!, fetchFn);
				reply.code(409);
				return reply.send({ error: 'duplicate_subscription', message: '이미 등록된 알림이에요.' });
			}
			void deleteDiscordWebhook(hubResponse.webhookId!, hubResponse.webhookToken!, fetchFn);
			return sendError(reply, error);
		}
	});

	// 구독 IDOR 방지: 길드 스코프 경로에서 `where: { id, guildId }`로 조회해요.
	// 다른 길드의 구독 UUID를 알아도 자기 길드 소유가 아니면 404예요 (생성·목록과 동일한 스코프 계약).
	fastify.patch('/v1/guilds/:guildId/social/subscriptions/:id', { preHandler: guard }, async (request, reply) => {
		const { guildId, id } = request.params as { guildId: string; id: string };
		if (!/^[a-zA-Z0-9_-]+$/.test(guildId)) {
			reply.code(400);
			return reply.send({ error: 'invalid_params', message: '길드 ID 형식이 올바르지 않아요.' });
		}
		if (!/^[0-9a-f-]{36}$/i.test(id)) {
			reply.code(400);
			return reply.send({ error: 'invalid_params', message: '구독 ID 형식이 올바르지 않아요.' });
		}
		const parsed = socialSubscriptionUpdateSchema.safeParse(request.body ?? {});
		if (!parsed.success) return sendError(reply, parsed.error);

		const db = getDb();
		if (!db) {
			reply.code(503);
			return reply.send({ error: 'db_unavailable', message: 'DB 연결이 없어요.' });
		}
		try {
			const row = await db.socialSubscription.update({
				where: { id, guildId },
				data: {
					...(parsed.data.messageTemplate !== undefined ? { messageTemplate: parsed.data.messageTemplate } : {}),
					...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
					...(parsed.data.webhookName !== undefined ? { webhookName: parsed.data.webhookName } : {}),
					...(parsed.data.webhookAvatarUrl !== undefined ? { webhookAvatarUrl: parsed.data.webhookAvatarUrl } : {}),
					...(parsed.data.showThumbnail !== undefined ? { showThumbnail: parsed.data.showThumbnail } : {})
				}
			});
			return reply.send({ subscription: publicSubscription(row) });
		} catch (error) {
			// 소유권 미일치(P2025)도 "찾지 못함"으로: 존재 여부를 새어 나가지 않아요.
			if (prismaErrorCode(error) === 'P2025') {
				reply.code(404);
				return reply.send({ error: 'subscription_not_found', message: '구독을 찾지 못했어요.' });
			}
			return sendError(reply, error);
		}
	});

	// 구독 IDOR 방지: PATCH와 같은 길드 스코프에서 소유권을 확인해요 (미소유 = 404).
	fastify.delete('/v1/guilds/:guildId/social/subscriptions/:id', { preHandler: guard }, async (request, reply) => {
		const { guildId, id } = request.params as { guildId: string; id: string };
		if (!/^[a-zA-Z0-9_-]+$/.test(guildId)) {
			reply.code(400);
			return reply.send({ error: 'invalid_params', message: '길드 ID 형식이 올바르지 않아요.' });
		}
		if (!/^[0-9a-f-]{36}$/i.test(id)) {
			reply.code(400);
			return reply.send({ error: 'invalid_params', message: '구독 ID 형식이 올바르지 않아요.' });
		}
		const db = getDb();
		if (!db) {
			reply.code(503);
			return reply.send({ error: 'db_unavailable', message: 'DB 연결이 없어요.' });
		}
		try {
			const row = await db.socialSubscription.findFirst({ where: { id, guildId } });
			if (!row) {
				reply.code(404);
				return reply.send({ error: 'subscription_not_found', message: '구독을 찾지 못했어요.' });
			}
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
		if (keyword.length < 1 || keyword.length > 50) {
			reply.code(400);
			return reply.send({ error: 'invalid_params', message: '검색어는 1~50자로 입력해 주세요.' });
		}
		const offset = Number.parseInt(query.offset ?? '0', 10) || 0;
		const size = Math.min(Math.max(Number.parseInt(query.size ?? '10', 10) || 10, 1), 20);
		try {
			const channels = await searchChzzkChannels(keyword, offset, size, fetchFn);
			return reply.send({ channels });
		} catch (error) {
			logger.warn(error, '[notifier] 치지직 검색 실패');
			reply.code(502);
			return reply.send({ error: 'chzzk_search_failed', message: '치지직 검색에 실패했어요. 잠시 후 다시 시도해 주세요.' });
		}
	});

	fastify.post('/v1/social/chzzk/profile', { preHandler: guard }, async (request, reply) => {
		const channelId = ((request.body as { channelId?: unknown })?.channelId ?? '').toString().trim();
		if (channelId.length < 8 || channelId.length > 64) {
			reply.code(400);
			return reply.send({ error: 'invalid_params', message: '치지직 채널 ID 형식이 올바르지 않아요.' });
		}
		try {
			const channel = await fetchChzzkChannelProfile(channelId, fetchFn);
			if (!channel) {
				reply.code(404);
				return reply.send({ error: 'chzzk_channel_not_found', message: '치지직 채널을 찾지 못했어요.' });
			}
			return reply.send({ channel });
		} catch (error) {
			logger.warn(error, '[notifier] 치지직 프로필 조회 실패');
			reply.code(502);
			return reply.send({ error: 'chzzk_profile_failed', message: '치지직 채널 조회에 실패했어요. 잠시 후 다시 시도해 주세요.' });
		}
	});

	fastify.post('/v1/social/youtube/resolve', { preHandler: guard }, async (request, reply) => {
		const input = ((request.body as { input?: unknown })?.input ?? '').toString().trim();
		if (input.length < 1 || input.length > 200) {
			reply.code(400);
			return reply.send({ error: 'invalid_params', message: '유튜브 채널 입력은 1~200자로 해 주세요.' });
		}
		try {
			const channel = await resolveYouTubeChannel(input, fetchFn);
			if (!channel.channelId) {
				reply.code(404);
				return reply.send({ error: 'youtube_channel_not_found', message: '유튜브 채널을 찾지 못했어요.' });
			}
			return reply.send({ channelId: channel.channelId, channelName: channel.channelName });
		} catch (error) {
			logger.warn(error, '[notifier] 유튜브 채널 해석 실패');
			reply.code(502);
			return reply.send({ error: 'youtube_resolve_failed', message: '유튜브 채널 확인에 실패했어요. 잠시 후 다시 시도해 주세요.' });
		}
	});

	fastify.post('/v1/social/twitch/resolve', { preHandler: guard }, async (request, reply) => {
		const login = ((request.body as { login?: unknown })?.login ?? '').toString().trim();
		if (!/^[a-zA-Z0-9_]{4,25}$/.test(login)) {
			reply.code(400);
			return reply.send({ error: 'invalid_params', message: '트위치 로그인 아이디 형식이 아니에요.' });
		}
		if (!twitchClient) {
			reply.code(503);
			return reply.send({ error: 'twitch_not_configured', message: '트위치 연동이 설정되지 않았어요.' });
		}
		try {
			const user = await twitchClient.getTwitchUser(login);
			if (!user) {
				reply.code(404);
				return reply.send({ error: 'twitch_user_not_found', message: '트위치 사용자를 찾지 못했어요.' });
			}
			return reply.send({ id: user.id, login: user.login, displayName: user.displayName });
		} catch (error) {
			logger.warn(error, '[notifier] 트위치 사용자 해석 실패');
			reply.code(502);
			return reply.send({ error: 'twitch_resolve_failed', message: '트위치 사용자 확인에 실패했어요. 잠시 후 다시 시도해 주세요.' });
		}
	});
}
