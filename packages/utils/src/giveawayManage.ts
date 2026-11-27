import { z } from 'zod';
import { giveawayConditionSchema, giveawayPrizeSchema, giveawayWinnerCountSchema } from './giveaway.js';
import { redisIdSchema } from './redisChannels.js';

const snowflake = z.string().regex(/^\d{17,20}$/, '올바른 ID 형식이 아니에요.');

const base = {
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	userId: snowflake
};

export const giveawayManageRequestSchema = z.discriminatedUnion('action', [
	z.object({
		...base,
		action: z.literal('start'),
		channelId: snowflake,
		prize: giveawayPrizeSchema,
		winnerCount: giveawayWinnerCountSchema,
		endsAt: z.string().datetime(),
		conditions: z.array(giveawayConditionSchema).max(10)
	}),
	z.object({ ...base, action: z.literal('end'), giveawayId: z.string().min(1).max(64) }),
	z.object({ ...base, action: z.literal('cancel'), giveawayId: z.string().min(1).max(64) }),
	z.object({ ...base, action: z.literal('reroll'), giveawayId: z.string().min(1).max(64), count: giveawayWinnerCountSchema })
]);
export type GiveawayManageRequest = z.infer<typeof giveawayManageRequestSchema>;

export const giveawayManageResponseSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	error: z.string().optional(),
	giveawayId: z.string().optional(),
	winnerIds: z.array(snowflake).optional()
});
export type GiveawayManageResponse = z.infer<typeof giveawayManageResponseSchema>;
