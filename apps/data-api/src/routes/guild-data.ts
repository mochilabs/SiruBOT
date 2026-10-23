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
import { DataApiError } from './serveCached.ts';
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

/** Redis 연결을 받아오지 못하면 503으로 거절하고 null을 돌려 핸들러가 조기 반환해요.
 *  Redis 없으면 브로드캐스트 불가, 실패로 대응해 대시보드가 재시도 가능하게 해요. */
function requireRedisClient(reply: { code: (n: number) => any }, message: string): NonNullable<ReturnType<typeof sharedCache.getClient>> | null {
	const client = sharedCache.getClient();
	if (!client) {
		reply.code(503).send({ error: 'redis_unavailable', message });
		return null;
	}
	return client;
}

/** pending 키를 NX로 선점해요. 이전 요청 키가 아직 남아 있으면(선점 실패) 409로 거절해요. */
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
	// 봇 프로필 상태 (화면 조회 시 봇에 최신 상태를 요청하고 캐시를 폴백으로 사용)
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

	// 길드 설정 캐시 무효화 (대시보드 저장 후 봇 브로드캐스트)
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
			const client = requireRedisClient(reply, '무효화 브로드캐스트를 위해 Redis가 필요해요.');
			if (!client) return reply;
			await client.publish(GUILD_SETTINGS_INVALIDATE_CHANNEL, JSON.stringify(reason ? { guildId, reason } : { guildId }));
			metrics.request('guild-settings-invalidate');
			return reply.send({ ok: true });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// JTC 마커 채널 셋업 (대시보드 설정 → 봇 tempVoiceService 수행)
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

	// 봇 프로필(닉네임·아바타) 적용 요청 (대시보드 저장 후 봇 적용)
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

			const client = requireRedisClient(reply, '봇 프로필 적용을 위해 Redis가 필요해요.');
			if (!client) return reply;
			// pending 키는 길드당 1개. 봇이 소비(NX 선점)하기 전에 두 번째 요청이 덮어쓰면 첫 요청의 변경이
			// 조용히 날아가므로 409로 거절해요. 봇이 키를 읽는 즉시 지우므로 정상 흐름에서는 잠깐만 점유돼요.
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

	// 멤버 인사 테스트 전송 (대시보드 → 봇)
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
			const client = requireRedisClient(reply, '인사 테스트 전송을 위해 Redis가 필요해요.');
			if (!client) return reply;
			const requestId = crypto.randomUUID();
			// pending 키는 길드당 1개. 두 번째 요청이 첫 페이로드를 덮어쓰면 첫 requestId로는 결과가 절대 오지 않아요.
			// 봇이 소비(NX 선점) 전 겹친 요청은 409로 거절해요. 데이터 오작동은 requestId 상관이 막지만 첫 요청 전체가 타임아웃돼요.
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

	// 멤버 인사 테스트 전송 결과 (대시보드 폴링, bot-profile 상태 엔드포인트와 같은 패턴)
	fastify.get('/v1/greeting/state/:guildId', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			return reply.send(getGreetingTestResult(guildId));
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// 길드 데이터 (대시보드 → Redis request → 봇 캐시 → requestId 상관 응답)
	// 대시보드는 사용자 토큰으로 Discord API를 직접 호출하면 401이 나서 봇 권한으로 우회해요.
	// data-api가 request 채널(sirubot:guild-data:request)로 퍼블리시하면 봇이 응답 채널(sirubot:guild-data:response)에 목록을 돌려주고 guildDataHub가 requestId로 상관해요. Redis가 없으면 503, 봇이 3초 안에 응답하지 않으면(봇 미보유·미연결 포함) 502로 실패해요.
	// 채널·역할 목록은 파라미터 파싱, 실패 매핑, 메트릭, 응답 조립이 같아 한 팩토리로 등록하고 멤버는 쿼리 검증이 있어 따로 둬요.
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

	// 멤버 표시 정보 (대시보드 통계 topRequesters의 아바타/별명 표시, 채널·역할과 같은 Redis request/reply)
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
