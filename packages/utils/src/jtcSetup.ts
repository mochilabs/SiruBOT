import { z } from 'zod';
import { redisIdSchema } from './redisChannels.js';

export const jtcSetupRequestSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	userId: redisIdSchema,
	categoryId: redisIdSchema,
	markerChannelName: z.string().trim().min(1).max(100).optional()
});

export const jtcSetupResponseSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	error: z.string().optional(),
	markerChannelId: redisIdSchema.optional()
});
export type JtcSetupResponse = z.infer<typeof jtcSetupResponseSchema>;
