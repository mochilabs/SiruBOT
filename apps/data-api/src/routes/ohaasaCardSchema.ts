import { z } from 'zod';

/**
 * 운세 카드 이미지 입력 — 카드는 요약(별자리·순위·행운의 아이템/열쇠·날짜)만 그려요.
 * 운세 설명(content)·럭키 컬러는 의도적으로 필드 자체를 받지 않아요 — 정보성 본문은
 * 봇이 /v1/ohaasa 응답의 텍스트로만 내려서 이미지/본문 중복을 막아요.
 */
export const ohaasaCardSchema = z.object({
	zodiacCode: z.string().regex(/^(0[1-9]|1[0-2])$/),
	rank: z.number().int().min(1).max(12),
	luckyItem: z.string().trim().max(300).optional(),
	luckyKey: z.string().trim().max(300).optional(),
	date: z.string().trim().max(40).default('')
});
