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
import { sendError, guildIdParams, playerUserIdSchema, replyBotRelayFailure } from './common.ts';
import { getBotProfile, botProfileHubStatus, refreshBotProfile } from '../services/botProfileHub.ts';
import { getGreetingTestResult } from '../services/memberGreetingHub.ts';
import { requestGuildData, type GuildDataFailureReason } from '../services/guildDataHub.ts';
import { requestJtcSetup, type JtcSetupResult } from '../services/jtcSetupHub.ts';

/**
 * 길드 도메인 — 대시보드가 봇 권한이 필요한 작업을 data-api로 우회하는 흐름이에요.
 * 채널/역할/멤버·JTC 셋업은 Redis request/reply 상관이고, 길드 설정 무효화·봇 프로필 적용·인사 테스트는
 * pending 키 + 채널 브로드캐스트 발행이에요.
 */

/** 길드 데이터 요청 실패 이유를 HTTP 응답으로 매핑해요 — redis_unavailable=503, timeout(봇 미응답)=502.
 *  이 흐름에는 봇 검증 거부(bot_error) 사유가 없어서 공통부의 400 분기는 도달하지 않아요. */
function replyGuildDataFailure(reply: { code: (n: number) => any }, reason: GuildDataFailureReason): any {
	return replyBotRelayFailure(reply, reason, { code: 'guild_data_rejected', message: null, fallback: '' });
}

export function registerGuildDataRoutes(fastify: FastifyInstance): void {
	// ── 봇 프로필 상태 (화면 조회 시 봇에 최신 상태를 요청하고 캐시를 폴백으로 사용) ──
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

	// ── 길드 설정 캐시 무효화 (대시보드 저장 후 봇 브로드캐스트) ──
	// 대시보드가 Prisma로 길드 설정을 직접 upsert하므로, 저장 성공 후 호출해 모든 봇 프로세스의
	// GuildService 캐시를 비워요. 봇은 채널(`sirubot:guild-settings:invalidate`)을 구독해 자기
	// 캐시에서 해당 guildId를 지우고 다음 조회 때 DB에서 다시 읽어요.
	// reason이 'mixer'면 봇이 재생 중인 플레이어에 갭리스·크로스페이드 설정을 바로 밀어 넣어요.
	const invalidateSchema = z.object({
		guildId: redisIdSchema,
		reason: z.enum(['mixer']).optional()
	});
	fastify.post('/v1/internal/guild-settings/invalidate', async (request, reply) => {
		try {
			const { guildId, reason } = invalidateSchema.parse(request.body);
			const client = sharedCache.getClient();
			if (!client) {
				// Redis 없으면 브로드캐스트 불가 — 실패로 대응해 대시보드가 재시도 가능하게 해요.
				return reply.code(503).send({ error: 'redis_unavailable', message: '무효화 브로드캐스트를 위해 Redis가 필요해요.' });
			}
			await client.publish(GUILD_SETTINGS_INVALIDATE_CHANNEL, JSON.stringify(reason ? { guildId, reason } : { guildId }));
			metrics.request('guild-settings-invalidate');
			return reply.send({ ok: true });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── JTC 마커 채널 셋업 (대시보드 설정 → 봇 tempVoiceService 수행) ──
	// 마커 채널 생성·이동은 봇 토큰으로만 가능해요 (유저 OAuth 토큰에는 길드 채널 관리 권한이 없어요).
	// 봇이 tempVoiceService.setupMarkerChannel로 카테고리 검증 → 마커 재사용(이동)·생성 → DB 저장까지
	// 수행하고 응답해요. Redis 없으면 503, 봇이 응답하지 않으면 502, 봇이 검증 실패 사유를 실어 보내면 400.
	const jtcSetupRequestBody = z.object({
		guildId: redisIdSchema,
		userId: playerUserIdSchema,
		categoryId: redisIdSchema
	});

	/** JtcSetupResult를 HTTP로 매핑 — 성공은 markerChannelId, 실패는 공통부(replyBotRelayFailure)로 내려줘요 */
	function replyJtcSetupResult(reply: { code: (n: number) => any; send: (body: unknown) => any }, result: JtcSetupResult): any {
		if (result.ok) {
			return reply.send({ ok: true, markerChannelId: result.markerChannelId ?? null });
		}
		// 봇이 검증 실패(카테고리 아님·권한 부족 등)를 실어 보낸 경우 — 사용자가 고칠 수 있는 행동이므로 400
		return replyBotRelayFailure(reply, result.reason, {
			code: 'jtc_setup_rejected',
			message: result.message,
			fallback: '임시 방 마커 채널을 준비하지 못했어요.'
		});
	}

	fastify.post('/v1/internal/jtc/setup', async (request, reply) => {
		try {
			const { guildId, userId, categoryId } = jtcSetupRequestBody.parse(request.body);
			const result = await requestJtcSetup({
				requestId: crypto.randomUUID(),
				guildId,
				userId,
				categoryId
			});
			metrics.request('jtc-setup');
			return replyJtcSetupResult(reply, result);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 봇 프로필(닉네임·아바타) 적용 요청 (대시보드 저장 후 봇 적용) ──
	// 아바타는 data URI로 온다(3MiB 파일 → base64 ~4.2MB). Fastify 기본 bodyLimit(1MiB)을 넘으므로
	// 이 라우트만 8MiB로 올려요. 본문은 Redis pending 키에 기록하고 set 채널로 guildId만 브로드캐스트해요 —
	// 큰 본문이 레플리카 수만큼 복제되지 않아요. 봇은 소유 길드만 읽고 즉시 지워요 (TTL 120초).
	const botProfileSetSchema = z
		.object({
			guildId: redisIdSchema,
			// undefined = 변경 없음 / string = 설정 / null = 기본값(사용자명 사용으로 초기화)
			nickname: z.string().max(32).nullable().optional(),
			avatar: z.union([z.string().startsWith('data:image/').max(5_500_000), z.null()]).optional(),
			banner: z.union([z.string().startsWith('data:image/').max(5_500_000), z.null()]).optional()
		})
		.refine((body) => 'nickname' in body || 'avatar' in body || 'banner' in body, { message: '변경할 프로필 항목이 없어요.' });
	const BOT_PROFILE_PENDING_TTL_SECONDS = 120;

	// Redis 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY (봇과 공유). pending 값·트리거 메시지 모두 서명해요 (SEC-006).
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

			const client = sharedCache.getClient();
			if (!client) {
				// Redis 없으면 브로드캐스트 불가 — 실패로 대응해 대시보드가 재시도 가능하게 해요.
				return reply.code(503).send({ error: 'redis_unavailable', message: '봇 프로필 적용을 위해 Redis가 필요해요.' });
			}
			await client.set(botProfilePendingKey(guildId), wrapRedisMessage(redisSigningKey, payload), { EX: BOT_PROFILE_PENDING_TTL_SECONDS });
			await client.publish(BOT_PROFILE_SET_CHANNEL, wrapRedisMessage(redisSigningKey, { guildId }));
			metrics.request('bot-profile-set');
			return reply.send({ ok: true });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 멤버 인사 테스트 전송 (대시보드 → 봇) ──
	// bot-profile set과 같은 pending 키 + 브로드캐스트 패턴이에요. 본문({kind, userId, requestId})은
	// pending 키에 기록해 소유 봇 프로세스만 읽게 하고, 채널로는 guildId·requestId만 실어요.
	// 봇은 실제 멤버 정보로 카드를 렌더·전송하고 결과를 state 채널(memberGreetingStateChannel)로 알려요.
	const greetingSendSchema = z.object({
		guildId: redisIdSchema,
		kind: z.enum(['welcome', 'goodbye']),
		userId: redisIdSchema
	});
	const GREETING_PENDING_TTL_SECONDS = 120;

	fastify.post('/v1/internal/greeting/send', async (request, reply) => {
		try {
			const body = greetingSendSchema.parse(request.body);
			const client = sharedCache.getClient();
			if (!client) {
				// Redis 없으면 브로드캐스트 불가 — 실패로 대응해 대시보드가 재시도 가능하게 해요.
				return reply.code(503).send({ error: 'redis_unavailable', message: '인사 테스트 전송을 위해 Redis가 필요해요.' });
			}
			const requestId = crypto.randomUUID();
			await client.set(
				memberGreetingPendingKey(body.guildId),
				wrapRedisMessage(redisSigningKey, { kind: body.kind, userId: body.userId, requestId }),
				{
					EX: GREETING_PENDING_TTL_SECONDS
				}
			);
			await client.publish(MEMBER_GREETING_SEND_CHANNEL, wrapRedisMessage(redisSigningKey, { guildId: body.guildId, requestId }));
			metrics.request('greeting-send');
			return reply.send({ ok: true, requestId });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 멤버 인사 테스트 전송 결과 (대시보드 폴링 — bot-profile 상태 엔드포인트와 같은 패턴) ──
	fastify.get('/v1/greeting/state/:guildId', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			return reply.send(getGreetingTestResult(guildId));
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 길드 데이터 (대시보드 → Redis request → 봇 캐시 → requestId 상관 응답) ──
	// 대시보드는 사용자 토큰으로 Discord API를 직접 호출하면 401이 나서 봇 권한으로 우회해요.
	// data-api가 request 채널(sirubot:guild-data:request)로 요청을 퍼블리시하면 해당 길드를 보유한
	// 봇 프로세스가 자기 캐시에서 목록을 응답 채널(sirubot:guild-data:response)로 돌려주고,
	// guildDataHub가 requestId로 요청과 응답을 상관해 내려줘요. Redis가 없으면 503,
	// 봇이 3초 안에 응답하지 않으면(봇 미보유·미연결 포함) 502로 실패해요.
	fastify.get('/v1/guilds/:guildId/channels', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			const result = await requestGuildData(guildId, 'channels');
			if (!result.ok) return replyGuildDataFailure(reply, result.reason);
			metrics.request('guild-data-channels');
			return reply.send({ channels: result.channels ?? [] });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.get('/v1/guilds/:guildId/roles', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			const result = await requestGuildData(guildId, 'roles');
			if (!result.ok) return replyGuildDataFailure(reply, result.reason);
			metrics.request('guild-data-roles');
			return reply.send({ roles: result.roles ?? [] });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 멤버 표시 정보 (대시보드 통계 topRequesters의 아바타/별명 표시 — 채널·역할과 같은 Redis request/reply) ──
	// 조회 대상은 userIds 쿼리(쉼표 구분, 최대 10명)로 지정해요. 봇 캐시에서 못 찾은 멤버는 응답에서
	// 빠져요 — 호출자(dashboard stats)가 ID 라벨로 폴백해요.
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
