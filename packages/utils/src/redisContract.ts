/**
 * Redis pub/sub 계약 정의 — 채널 문자열·요청/응답 스키마를 한 객체로 묶어 봇(응답자)과 data-api(허브)가
 * 같은 계약을 임포트하게 해요. 채널 문자열은 롤링 배포 중 구·신 프로세스가 함께 돌기 때문에 기존
 * redisChannels.ts 상수에서 그대로 가져오고, 여기서 새로 만들지 않아요 (redisContract.test.ts가 고정해요).
 *
 * - RPC(request/reply): 요청 채널 + 응답 채널 + 두 스키마. 응답자는 requestId(+guildId·kind)로 상관해요.
 * - 이벤트(one-way): 채널 하나(또는 길드별 접두사) + 페이로드 스키마. 응답이 없어요.
 * - `signed`는 메시지가 서명 봉투(redisEnvelope)로 오가는지예요 — 설정 무효화 브로드캐스트만 서명 없이 흘러요.
 */
import { z } from 'zod';
import { botAdminRequestSchema, botAdminResponseSchema } from './botAdmin.js';
import { guildDataRequestSchema, guildDataResponseSchema } from './guildData.js';
import { jtcSetupRequestSchema, jtcSetupResponseSchema } from './jtcSetup.js';
import { panelPostRequestSchema, panelPostResponseSchema } from './panelPost.js';
import { playerStateSchema } from './playerState.js';
import { playerWebRequestBaseSchema, playerWebResponseSchema } from './playerWeb.js';
import {
	BOT_ADMIN_REQUEST_CHANNEL,
	BOT_ADMIN_RESPONSE_CHANNEL,
	BOT_PROFILE_REFRESH_CHANNEL,
	BOT_PROFILE_SET_CHANNEL,
	BOT_PROFILE_STATE_CHANNEL_PREFIX,
	GUILD_DATA_REQUEST_CHANNEL,
	GUILD_DATA_RESPONSE_CHANNEL,
	GUILD_SETTINGS_INVALIDATE_CHANNEL,
	JTC_SETUP_REQUEST_CHANNEL,
	JTC_SETUP_RESPONSE_CHANNEL,
	MEMBER_GREETING_SEND_CHANNEL,
	MEMBER_GREETING_STATE_CHANNEL_PREFIX,
	PANEL_POST_REQUEST_CHANNEL,
	PANEL_POST_RESPONSE_CHANNEL,
	PLAYER_STATE_CHANNEL_PREFIX,
	PLAYER_WEB_REQUEST_CHANNEL,
	PLAYER_WEB_RESPONSE_CHANNEL,
	ROLE_VALIDATION_REQUEST_CHANNEL,
	ROLE_VALIDATION_RESPONSE_CHANNEL,
	SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL,
	SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL
} from './redisChannels.js';
import { roleValidationRequestSchema, roleValidationResponseSchema } from './rolePanel.js';
import { socialWebhookCreateRequestSchema, socialWebhookCreateResponseSchema } from './social.js';

/** request/reply 계약 — 응답자(봇)와 허브(data-api)가 같은 객체를 써요. */
export interface RedisRpcContract<TRequest extends z.ZodType = z.ZodType, TResponse extends z.ZodType = z.ZodType> {
	/** 로그 접두사 — 예: '길드 데이터' */
	readonly name: string;
	readonly requestChannel: string;
	readonly responseChannel: string;
	readonly requestSchema: TRequest;
	readonly responseSchema: TResponse;
}

/** 계약에서 요청 본문 타입(검증 후)을 꺼내요 */
export type RedisRpcRequest<TContract extends RedisRpcContract> = z.output<TContract['requestSchema']>;
/** 계약에서 요청 본문 타입(검증 전, 퍼블리셔가 보내는 형태)을 꺼내요 */
export type RedisRpcRequestInput<TContract extends RedisRpcContract> = z.input<TContract['requestSchema']>;
/** 계약에서 응답 본문 타입을 꺼내요 */
export type RedisRpcResponse<TContract extends RedisRpcContract> = z.output<TContract['responseSchema']>;

export function defineRedisRpc<TRequest extends z.ZodType, TResponse extends z.ZodType>(
	contract: RedisRpcContract<TRequest, TResponse>
): RedisRpcContract<TRequest, TResponse> {
	return Object.freeze({ ...contract });
}

/**
 * 요청에서 응답 상관 필드(requestId·guildId·kind)를 뽑아요 — 응답자가 성공/오류 응답에 공통으로 실어요.
 * 요청에 없는 필드는 응답에도 넣지 않아요 (botAdmin 요청에는 guildId가 없어요).
 */
export function pickRpcCorrelation(request: unknown): { requestId: string; guildId?: string; kind?: string } {
	const source = (typeof request === 'object' && request !== null ? request : {}) as Record<string, unknown>;
	const correlation: { requestId: string; guildId?: string; kind?: string } = { requestId: String(source.requestId ?? '') };
	if (typeof source.guildId === 'string') correlation.guildId = source.guildId;
	if (typeof source.kind === 'string') correlation.kind = source.kind;
	return correlation;
}

/** 단방향 이벤트 계약 — 채널 하나. */
export interface RedisEventContract<TSchema extends z.ZodType = z.ZodType> {
	readonly name: string;
	readonly channel: string;
	readonly schema: TSchema;
	/** 서명 봉투로 오가는지 — 기본 true */
	readonly signed: boolean;
}

export function defineRedisEvent<TSchema extends z.ZodType>(contract: {
	name: string;
	channel: string;
	schema: TSchema;
	signed?: boolean;
}): RedisEventContract<TSchema> {
	return Object.freeze({ name: contract.name, channel: contract.channel, schema: contract.schema, signed: contract.signed ?? true });
}

/** 길드별 채널(`{prefix}{guildId}`) 이벤트 계약 — 상태 퍼블리시용이에요. */
export interface RedisGuildEventContract<TSchema extends z.ZodType = z.ZodType> {
	readonly name: string;
	readonly channelPrefix: string;
	/** 패턴 구독용 — `{prefix}*` */
	readonly pattern: string;
	readonly schema: TSchema;
	readonly signed: boolean;
	/** 퍼블리시 채널명 — `{prefix}{guildId}` */
	channel(guildId: string): string;
	/** 채널명에서 guildId를 뽑아요 — 이 계열이 아니면 null */
	guildIdFromChannel(channel: string): string | null;
}

export function defineRedisGuildEvent<TSchema extends z.ZodType>(contract: {
	name: string;
	channelPrefix: string;
	schema: TSchema;
	signed?: boolean;
}): RedisGuildEventContract<TSchema> {
	const { channelPrefix } = contract;
	return Object.freeze({
		name: contract.name,
		channelPrefix,
		pattern: `${channelPrefix}*`,
		schema: contract.schema,
		signed: contract.signed ?? true,
		channel: (guildId: string) => `${channelPrefix}${guildId}`,
		guildIdFromChannel: (channel: string) => (channel.startsWith(channelPrefix) ? channel.slice(channelPrefix.length) : null)
	});
}

// ───────────────────────── 상태 페이로드 스키마 (봇 → data-api 단방향) ─────────────────────────

/**
 * 봇이 state 채널로 퍼블리시하는 길드별 봇 프로필 상태 — 봇의 BotProfileState와 같은 계약이에요.
 * 형태 검증은 이 zod 스키마가 단일 소스예요 (필드 추가 시 무시되지 않게).
 */
export const botProfileStateSchema = z.object({
	guildId: z.string().min(1).max(32),
	/** 현재 길드 닉네임 — null이면 사용자명으로 표시 중이에요 */
	nickname: z.string().nullable(),
	/** 봇 사용자명 — 닉네임 초기화 시 표시할 기본값이에요 */
	username: z.string(),
	/** 길드 전용 아바타 URL — 설정 안 됐으면 null (패널은 전역 아바타를 보여줘요) */
	guildAvatarUrl: z.string().nullable(),
	/** 길드 전용 배너 URL — 설정 안 됐으면 null */
	guildBannerUrl: z.string().nullable(),
	/** 전역(앱) 아바타 URL */
	globalAvatarUrl: z.string().nullable(),
	/** 닉네임 변경 가능 여부 — CHANGE_NICKNAME 또는 MANAGE_NICKNAMES */
	canChangeNickname: z.boolean(),
	/** 마지막 적용 시도 결과 — 시도가 없으면 null */
	lastApply: z.object({ ok: z.boolean(), error: z.string().nullable(), at: z.number() }).nullable().default(null),
	updatedAt: z.number()
});
export type BotProfileStatePayload = z.infer<typeof botProfileStateSchema>;

/**
 * 봇이 state 채널로 퍼블리시하는 멤버 인사 테스트 전송 결과.
 * sentAt은 epoch milliseconds(number)가 계약이에요 — 레거시 ISO 문자열은 number로 정규화하고,
 * 없거나 깨졌으면 수신 시각으로 대체해요 (값 타입이 이상해도 결과 전체를 버리지 않게).
 */
export const memberGreetingTestStateSchema = z.object({
	requestId: z.string().min(1).max(64),
	kind: z.enum(['welcome', 'goodbye']),
	ok: z.boolean(),
	/** 실패 사유 — 봇이 실패 때만 담고, 없으면 null이에요 */
	error: z.string().nullable().default(null),
	sentAt: z
		.union([
			z.number(),
			z.string().transform((value, ctx) => {
				const at = Date.parse(value);
				if (Number.isNaN(at)) {
					ctx.addIssue({ code: 'custom', message: 'ISO8601 날짜 형식이 아니에요' });
					return z.NEVER;
				}
				return at;
			})
		])
		.catch(() => Date.now())
});
export type GreetingTestResult = z.infer<typeof memberGreetingTestStateSchema>;

// ───────────────────────── 트리거 이벤트 페이로드 스키마 (data-api → 봇 단방향) ─────────────────────────

/** 길드 ID — 기존 수신 측 검증(1~32자 문자열)을 그대로 유지해요 */
const triggerGuildIdSchema = z.string().min(1).max(32);

/** 설정 무효화 — reason은 알려진 값('mixer')만 의미가 있고 모르는 값은 무시해요 (거부하지 않아요) */
export const guildSettingsInvalidateSchema = z.object({ guildId: triggerGuildIdSchema, reason: z.unknown().optional() });
export const botProfileTriggerSchema = z.object({ guildId: triggerGuildIdSchema });
/** 멤버 인사 전송 트리거 — requestId가 형식에 어긋나면 값만 버리고 트리거는 처리해요 */
export const memberGreetingSendSchema = z.object({
	guildId: triggerGuildIdSchema,
	requestId: z.string().min(1).max(64).optional().catch(undefined)
});

// ───────────────────────── RPC 계약 ─────────────────────────

export const guildDataRpc = defineRedisRpc({
	name: '길드 데이터',
	requestChannel: GUILD_DATA_REQUEST_CHANNEL,
	responseChannel: GUILD_DATA_RESPONSE_CHANNEL,
	requestSchema: guildDataRequestSchema,
	responseSchema: guildDataResponseSchema
});

/** 웹 플레이어 — 요청은 공통부만 검증하고 kind별 상세는 응답자가 해당 스키마로 좁혀요 (그래서 loose예요) */
export const playerWebRpc = defineRedisRpc({
	name: '웹 플레이어',
	requestChannel: PLAYER_WEB_REQUEST_CHANNEL,
	responseChannel: PLAYER_WEB_RESPONSE_CHANNEL,
	requestSchema: playerWebRequestBaseSchema.loose(),
	responseSchema: playerWebResponseSchema
});

export const jtcSetupRpc = defineRedisRpc({
	name: 'JTC 셋업',
	requestChannel: JTC_SETUP_REQUEST_CHANNEL,
	responseChannel: JTC_SETUP_RESPONSE_CHANNEL,
	requestSchema: jtcSetupRequestSchema,
	responseSchema: jtcSetupResponseSchema
});

export const socialWebhookCreateRpc = defineRedisRpc({
	name: '소셜 웹훅 생성',
	requestChannel: SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL,
	responseChannel: SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL,
	requestSchema: socialWebhookCreateRequestSchema,
	responseSchema: socialWebhookCreateResponseSchema
});

export const botAdminRpc = defineRedisRpc({
	name: '봇 관리자 제어',
	requestChannel: BOT_ADMIN_REQUEST_CHANNEL,
	responseChannel: BOT_ADMIN_RESPONSE_CHANNEL,
	requestSchema: botAdminRequestSchema,
	responseSchema: botAdminResponseSchema
});

export const panelPostRpc = defineRedisRpc({
	name: '패널 게시',
	requestChannel: PANEL_POST_REQUEST_CHANNEL,
	responseChannel: PANEL_POST_RESPONSE_CHANNEL,
	requestSchema: panelPostRequestSchema,
	responseSchema: panelPostResponseSchema
});

export const roleValidationRpc = defineRedisRpc({
	name: '역할 검증',
	requestChannel: ROLE_VALIDATION_REQUEST_CHANNEL,
	responseChannel: ROLE_VALIDATION_RESPONSE_CHANNEL,
	requestSchema: roleValidationRequestSchema,
	responseSchema: roleValidationResponseSchema
});

// ───────────────────────── 이벤트 계약 ─────────────────────────

/** 길드 설정 캐시 무효화 — data-api가 서명 없이 퍼블리시해요 (대시보드 저장 흐름) */
export const guildSettingsInvalidateEvent = defineRedisEvent({
	name: '설정 무효화',
	channel: GUILD_SETTINGS_INVALIDATE_CHANNEL,
	schema: guildSettingsInvalidateSchema,
	signed: false
});

export const botProfileSetEvent = defineRedisEvent({ name: '봇 프로필 set', channel: BOT_PROFILE_SET_CHANNEL, schema: botProfileTriggerSchema });
export const botProfileRefreshEvent = defineRedisEvent({
	name: '봇 프로필 refresh',
	channel: BOT_PROFILE_REFRESH_CHANNEL,
	schema: botProfileTriggerSchema
});
export const memberGreetingSendEvent = defineRedisEvent({
	name: '멤버 인사 전송',
	channel: MEMBER_GREETING_SEND_CHANNEL,
	schema: memberGreetingSendSchema
});

export const botProfileStateEvent = defineRedisGuildEvent({
	name: '봇 프로필 상태',
	channelPrefix: BOT_PROFILE_STATE_CHANNEL_PREFIX,
	schema: botProfileStateSchema
});
export const memberGreetingStateEvent = defineRedisGuildEvent({
	name: '멤버 인사 결과',
	channelPrefix: MEMBER_GREETING_STATE_CHANNEL_PREFIX,
	schema: memberGreetingTestStateSchema
});
export const playerStateEvent = defineRedisGuildEvent({
	name: '플레이어 상태',
	channelPrefix: PLAYER_STATE_CHANNEL_PREFIX,
	schema: playerStateSchema
});
