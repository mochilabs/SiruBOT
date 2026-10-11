import { z } from 'zod';

/**
 * 길드 데이터(채널·역할 목록) request/reply 공용 계약 — bot과 data-api가 함께 쓴다.
 * 대시보드의 채널/역할 조회는 사용자 토큰으로 Discord API를 직접 호출하면 401이 나므로
 * 봇 권한으로 우회한다: data-api가 GUILD_DATA_REQUEST_CHANNEL로 요청을 퍼블리시하면
 * 해당 길드를 보유한 봇 프로세스가 GUILD_DATA_RESPONSE_CHANNEL로 응답하고,
 * data-api guildDataHub가 requestId로 요청과 응답을 상관해 dashboard에 내려준다.
 * 채널명 상수는 redisChannels.ts의 GUILD_DATA_* 를 쓰고, 페이로드 검증은 이 파일의 스키마를 쓴다.
 */
export const guildDataKindSchema = z.enum(['channels', 'roles']);
export type GuildDataKind = z.infer<typeof guildDataKindSchema>;

export const guildDataRequestSchema = z.object({
	requestId: z.string().uuid(),
	guildId: z.string().min(1).max(32),
	kind: guildDataKindSchema
});
export type GuildDataRequest = z.infer<typeof guildDataRequestSchema>;

export const guildChannelItemSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.number().int(),
	parentId: z.string().nullable(),
	position: z.number().int()
});
export type GuildChannelItem = z.infer<typeof guildChannelItemSchema>;

export const guildRoleItemSchema = z.object({
	id: z.string(),
	name: z.string(),
	color: z.number().int(),
	position: z.number().int(),
	managed: z.boolean()
});
export type GuildRoleItem = z.infer<typeof guildRoleItemSchema>;

export const guildDataResponseSchema = z.object({
	requestId: z.string().uuid(),
	guildId: z.string().min(1).max(32),
	kind: guildDataKindSchema,
	channels: z.array(guildChannelItemSchema).optional(),
	roles: z.array(guildRoleItemSchema).optional(),
	error: z.string().optional()
});
export type GuildDataResponse = z.infer<typeof guildDataResponseSchema>;
