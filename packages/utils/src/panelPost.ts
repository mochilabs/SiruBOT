import { z } from 'zod';
import { redisIdSchema } from './redisChannels.js';

// Panel messages with custom-ID buttons must be sent with the bot token: a user-OAuth message's interactions wouldn't reach the bot.
// Channels: PANEL_POST_REQUEST_CHANNEL / PANEL_POST_RESPONSE_CHANNEL (redisChannels.ts).

/** A guild has one ticket panel (no panelId) but many role panels (panelId required). */
export const panelPostTypeSchema = z.enum(['ticket', 'rolePanel']);
export type PanelPostType = z.infer<typeof panelPostTypeSchema>;

const snowflake = z.string().regex(/^\d{17,20}$/, '올바른 ID 형식이 아니에요.');

/** 'ticket' updates the guild's TicketConfig panel channel/message; 'rolePanel' updates the RolePanel found by panelId. Without channelId the bot uses the channel already stored. */
export const panelPostRequestSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	type: panelPostTypeSchema,
	panelId: z.string().min(1).optional(),
	channelId: snowflake.optional(),
	/** Edits the posted message in place instead of sending a new one. */
	refresh: z.boolean().optional()
});

/** Loose on purpose so added fields don't break older readers. */
export const panelPostResponseSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	error: z.string().optional(),
	messageId: snowflake.optional(),
	channelId: snowflake.optional()
});
export type PanelPostResponse = z.infer<typeof panelPostResponseSchema>;
