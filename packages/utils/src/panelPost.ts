import { z } from 'zod';
import { redisIdSchema } from './redisChannels.js';

export const panelPostTypeSchema = z.enum(['ticket', 'rolePanel']);
export type PanelPostType = z.infer<typeof panelPostTypeSchema>;

const snowflake = z.string().regex(/^\d{17,20}$/, '올바른 ID 형식이 아니에요.');

export const panelPostRequestSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	type: panelPostTypeSchema,
	panelId: z.string().min(1).optional(),
	channelId: snowflake.optional(),
	refresh: z.boolean().optional()
});

export const panelPostResponseSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	error: z.string().optional(),
	messageId: snowflake.optional(),
	channelId: snowflake.optional()
});
export type PanelPostResponse = z.infer<typeof panelPostResponseSchema>;
