import { z } from 'zod';
import { redisIdSchema } from './redisChannels.js';

export const guildDataKindSchema = z.enum(['channels', 'roles', 'members']);
export type GuildDataKind = z.infer<typeof guildDataKindSchema>;

export const guildDataRequestSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	kind: guildDataKindSchema,
	userIds: z.array(redisIdSchema).max(10).optional()
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

export const guildMemberItemSchema = z.object({
	id: z.string(),
	displayName: z.string(),
	username: z.string(),
	avatarUrl: z.string().nullable()
});
export type GuildMemberItem = z.infer<typeof guildMemberItemSchema>;

export const guildDataResponseSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	kind: guildDataKindSchema,
	channels: z.array(guildChannelItemSchema).max(1000).optional(),
	roles: z.array(guildRoleItemSchema).max(500).optional(),
	members: z.array(guildMemberItemSchema).max(10).optional(),
	error: z.string().optional()
});
export type GuildDataResponse = z.infer<typeof guildDataResponseSchema>;
