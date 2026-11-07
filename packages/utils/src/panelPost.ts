import { z } from 'zod';
import { redisIdSchema } from './redisChannels.js';

/**
 * 패널 메시지 게시 request/reply 계약 — 티켓·역할 패널을 대시보드에서 직접 게시할 때 쓰는 공통 계약이에요.
 *
 * 패널 메시지(커스텀 ID 버튼 포함)는 봇 토큰으로만 보낼 수 있어요 (유저 OAuth 토큰으론 봇이 응답할
 * 커스텀 ID 인터랙션이 동작하지 않아요). 대시보드가 data-api `/v1/internal/panel/post`에 요청하면
 * data-api가 REQUEST 채널로 퍼블리시하고, 해당 길드를 보유한 봇 프로세스가 패널 메시지를 게시한 뒤
 * RESPONSE 채널로 messageId를 응답해요. hub가 requestId로 상관해 대시보드에 내려줘요.
 */

/** 게시할 패널 종류 — 티켓은 1:1(panelId 불필요), 역할 패널은 1:N(panelId 필요). */
export const panelPostTypeSchema = z.enum(['ticket', 'rolePanel']);
export type PanelPostType = z.infer<typeof panelPostTypeSchema>;

const snowflake = z.string().regex(/^\d{17,20}$/, '올바른 ID 형식이 아니에요.');

/**
 * 게시 요청 — type에 따라 panelId가 필요해요:
 * - 'ticket': 길드의 TicketConfig.panelChannelId/panelMessageId를 갱신 (panelId 불필요).
 * - 'rolePanel': panelId로 RolePanel을 찾아 channelId/messageId를 갱신.
 * channelId는 게시할 텍스트 채널 ID. 생략 시 봇이 기존 설정(패널에 이미 저장된 채널)을 사용해요.
 */
export const panelPostRequestSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	type: panelPostTypeSchema,
	panelId: z.string().min(1).optional(),
	channelId: snowflake.optional(),
	/** true면 이미 게시된 메시지를 새로 보내지 않고 제자리에서 갱신해요 (rolePanel 편집 반영용). */
	refresh: z.boolean().optional()
});

/**
 * 게시 응답 — 성공이면 messageId(새로 게시된 메시지)와 channelId를 채우고,
 * 실패면 error에 한국어 안내를 실어요. 스키마는 loose하게 두어(미사용 필드 허용)
 * 필드 추가가 이전 읽기를 깨지 않게 해요.
 */
export const panelPostResponseSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	error: z.string().optional(),
	messageId: snowflake.optional(),
	channelId: snowflake.optional()
});
export type PanelPostResponse = z.infer<typeof panelPostResponseSchema>;
