import { z } from 'zod';
import { giveawayConditionSchema, giveawayPrizeSchema, giveawayWinnerCountSchema } from './giveaway.js';
import { redisIdSchema } from './redisChannels.js';

/**
 * 나눔 관리 request/reply 계약 — 대시보드에서 나눔을 시작·종료·취소·다시 뽑을 때 써요.
 *
 * 참여 카드(커스텀 ID 버튼 포함) 게시와 결과 발표는 봇 토큰으로만 할 수 있어요. 대시보드가 data-api
 * `/v1/internal/giveaway/manage`에 요청하면 data-api가 REQUEST 채널로 퍼블리시하고, 해당 길드를 보유한 봇이
 * 슬래시 명령과 같은 서비스(GiveawayService)로 처리한 뒤 RESPONSE 채널로 결과를 응답해요.
 */

const snowflake = z.string().regex(/^\d{17,20}$/, '올바른 ID 형식이 아니에요.');

const base = {
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	/** 대시보드에서 요청한 사용자 — 나눔의 만든 사람으로 기록해요 */
	userId: snowflake
};

export const giveawayManageRequestSchema = z.discriminatedUnion('action', [
	z.object({
		...base,
		action: z.literal('start'),
		channelId: snowflake,
		prize: giveawayPrizeSchema,
		winnerCount: giveawayWinnerCountSchema,
		/** 마감 시각 (ISO 8601) */
		endsAt: z.string().datetime(),
		conditions: z.array(giveawayConditionSchema).max(10)
	}),
	z.object({ ...base, action: z.literal('end'), giveawayId: z.string().min(1).max(64) }),
	z.object({ ...base, action: z.literal('cancel'), giveawayId: z.string().min(1).max(64) }),
	z.object({ ...base, action: z.literal('reroll'), giveawayId: z.string().min(1).max(64), count: giveawayWinnerCountSchema })
]);
export type GiveawayManageRequest = z.infer<typeof giveawayManageRequestSchema>;

/** 성공이면 error 없이 giveawayId(시작)나 winnerIds(다시 뽑기)를 채우고, 실패면 error에 한국어 안내를 실어요 */
export const giveawayManageResponseSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	error: z.string().optional(),
	giveawayId: z.string().optional(),
	winnerIds: z.array(snowflake).optional()
});
export type GiveawayManageResponse = z.infer<typeof giveawayManageResponseSchema>;
