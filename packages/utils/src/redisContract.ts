// Channel strings come from redisChannels.ts and must stay stable across rolling deploys.
import { z } from 'zod';
import { botAdminRequestSchema, botAdminResponseSchema } from './botAdmin.js';
import { guildDataRequestSchema, guildDataResponseSchema } from './guildData.js';
import { jtcSetupRequestSchema, jtcSetupResponseSchema } from './jtcSetup.js';
import { giveawayManageRequestSchema, giveawayManageResponseSchema } from './giveawayManage.js';
import { panelPostRequestSchema, panelPostResponseSchema } from './panelPost.js';
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
	GIVEAWAY_MANAGE_REQUEST_CHANNEL,
	GIVEAWAY_MANAGE_RESPONSE_CHANNEL,
	PANEL_POST_REQUEST_CHANNEL,
	PANEL_POST_RESPONSE_CHANNEL,
	PLAYER_WEB_REQUEST_CHANNEL,
	PLAYER_WEB_RESPONSE_CHANNEL,
	ROLE_VALIDATION_REQUEST_CHANNEL,
	ROLE_VALIDATION_RESPONSE_CHANNEL,
	SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL,
	SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL
} from './redisChannels.js';
import { roleValidationRequestSchema, roleValidationResponseSchema } from './rolePanel.js';
import { socialWebhookCreateRequestSchema, socialWebhookCreateResponseSchema } from './social.js';

export interface RedisRpcContract<TRequest extends z.ZodType = z.ZodType, TResponse extends z.ZodType = z.ZodType> {
	readonly name: string;
	readonly requestChannel: string;
	readonly responseChannel: string;
	readonly requestSchema: TRequest;
	readonly responseSchema: TResponse;
}

export type RedisRpcRequest<TContract extends RedisRpcContract> = z.output<TContract['requestSchema']>;
export type RedisRpcRequestInput<TContract extends RedisRpcContract> = z.input<TContract['requestSchema']>;
export type RedisRpcResponse<TContract extends RedisRpcContract> = z.output<TContract['responseSchema']>;

export function defineRedisRpc<TRequest extends z.ZodType, TResponse extends z.ZodType>(
	contract: RedisRpcContract<TRequest, TResponse>
): RedisRpcContract<TRequest, TResponse> {
	return Object.freeze({ ...contract });
}

export function pickRpcCorrelation(request: unknown): { requestId: string; guildId?: string; kind?: string } {
	const source = (typeof request === 'object' && request !== null ? request : {}) as Record<string, unknown>;
	const correlation: { requestId: string; guildId?: string; kind?: string } = { requestId: String(source.requestId ?? '') };
	if (typeof source.guildId === 'string') correlation.guildId = source.guildId;
	if (typeof source.kind === 'string') correlation.kind = source.kind;
	return correlation;
}

export interface RedisEventContract<TSchema extends z.ZodType = z.ZodType> {
	readonly name: string;
	readonly channel: string;
	readonly schema: TSchema;
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

export interface RedisGuildEventContract<TSchema extends z.ZodType = z.ZodType> {
	readonly name: string;
	readonly channelPrefix: string;
	readonly pattern: string;
	readonly schema: TSchema;
	readonly signed: boolean;
	channel(guildId: string): string;
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

export const botProfileStateSchema = z.object({
	guildId: z.string().min(1).max(32),
	nickname: z.string().nullable(),
	username: z.string(),
	guildAvatarUrl: z.string().nullable(),
	guildBannerUrl: z.string().nullable(),
	globalAvatarUrl: z.string().nullable(),
	canChangeNickname: z.boolean(),
	lastApply: z.object({ ok: z.boolean(), error: z.string().nullable(), at: z.number() }).nullable().default(null),
	updatedAt: z.number()
});
export type BotProfileStatePayload = z.infer<typeof botProfileStateSchema>;

export const memberGreetingTestStateSchema = z.object({
	requestId: z.string().min(1).max(64),
	kind: z.enum(['welcome', 'goodbye']),
	ok: z.boolean(),
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

const triggerGuildIdSchema = z.string().min(1).max(32);

export const guildSettingsInvalidateSchema = z.object({ guildId: triggerGuildIdSchema, reason: z.unknown().optional() });
export const botProfileTriggerSchema = z.object({ guildId: triggerGuildIdSchema });
export const memberGreetingSendSchema = z.object({
	guildId: triggerGuildIdSchema,
	requestId: z.string().min(1).max(64).optional().catch(undefined)
});

export const guildDataRpc = defineRedisRpc({
	name: '길드 데이터',
	requestChannel: GUILD_DATA_REQUEST_CHANNEL,
	responseChannel: GUILD_DATA_RESPONSE_CHANNEL,
	requestSchema: guildDataRequestSchema,
	responseSchema: guildDataResponseSchema
});

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

export const giveawayManageRpc = defineRedisRpc({
	name: '나눔 관리',
	requestChannel: GIVEAWAY_MANAGE_REQUEST_CHANNEL,
	responseChannel: GIVEAWAY_MANAGE_RESPONSE_CHANNEL,
	requestSchema: giveawayManageRequestSchema,
	responseSchema: giveawayManageResponseSchema
});

export const roleValidationRpc = defineRedisRpc({
	name: '역할 검증',
	requestChannel: ROLE_VALIDATION_REQUEST_CHANNEL,
	responseChannel: ROLE_VALIDATION_RESPONSE_CHANNEL,
	requestSchema: roleValidationRequestSchema,
	responseSchema: roleValidationResponseSchema
});

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
