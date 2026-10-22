import { z } from 'zod';
import { redisIdSchema } from './redisChannels.js';

/**
 * 임시 방(JTC) 마커 채널 셋업 request/reply 계약 — dashboard, data-api, bot이 함께 쓴다.
 * 마커 채널 생성·이동은 Discord 규격상 봇 토큰으로만 가능해요 (유저 OAuth 토큰에는 길드 채널
 * 관리 권한이 없어요). guildData·playerWeb과 같은 request/reply로 우회해요:
 * 대시보드가 data-api `/v1/internal/jtc/setup`에 요청하면 data-api가 REQUEST 채널로 퍼블리시하고,
 * 해당 길드를 보유한 봇 프로세스가 tempVoiceService.setupMarkerChannel로 수행한 뒤
 * RESPONSE 채널로 응답해요. hub가 requestId로 상관해 대시보드에 내려줘요.
 */
export const jtcSetupRequestSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	userId: redisIdSchema,
	categoryId: redisIdSchema
});

/**
 * 응답 — 성공이면 markerChannelId를 채우고, 실패면 error에 한국어 안내를 실어요.
 * 스키마는 loose하게 두어(미사용 필드 허용) 필드 추가가 이전 읽기를 깨지 않게 해요.
 */
export const jtcSetupResponseSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	error: z.string().optional(),
	markerChannelId: redisIdSchema.optional()
});
export type JtcSetupResponse = z.infer<typeof jtcSetupResponseSchema>;
