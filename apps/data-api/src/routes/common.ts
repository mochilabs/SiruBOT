import { z } from 'zod';
import { redisIdSchema } from '@sirubot/utils';
import { getLogger } from '../utils/logger.ts';
import { DataApiError } from './serveCached.ts';

const logger = getLogger('common');

/**
 * 도메인 라우트 모듈(ohaasa·embed-fix·cache-providers·render·ai·player·guild-data)이 공유하는 라우트 공통부 —
 * HTTP 에러 응답 매핑과 여러 모듈에서 쓰는 파라미터 스키마예요.
 * 한 도메인에서만 쓰는 응답 헬퍼(replyPlayerWebResult·replyJtcSetupResult 등)는 해당 도메인 파일에 남겨요.
 */

export function sendError(reply: { code: (n: number) => any }, error: unknown): any {
	if (error instanceof DataApiError) {
		return reply.code(error.status).send({ error: error.code, message: error.message });
	}
	if (error instanceof z.ZodError) {
		return reply.code(400).send({
			error: 'invalid_params',
			message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
		});
	}
	// 스택/detail은 앱 로거에만 남기고 500 응답 본문에는 일반 메시지만 내려요 (내부 정보 유출 방지).
	const stack = error instanceof Error ? error.stack : undefined;
	const detail = error instanceof Error ? error.message : String(error);
	logger.error(`unhandled route error: ${detail}${stack ? `\n${stack}` : ''}`);
	return reply.code(500).send({
		error: 'internal_error',
		message: '일시적인 오류예요. 잠시 후 다시 시도해 주세요.'
	});
}

/** 봇 릴레이 실패 사유를 HTTP로 매핑하는 공통부 — redis_unavailable=503, timeout(봇 미응답)=502,
 *  그 외(봇이 실어 보낸 검증 거부·오류)=400. 세 릴레이 흐름(길드 데이터·플레이어 웹·JTC 셋업)이 같은 규칙을 써요. */
export function replyBotRelayFailure(
	reply: { code: (n: number) => any },
	reason: 'redis_unavailable' | 'timeout' | 'bot_error',
	rejected: { code: string; message: string | null | undefined; fallback: string }
): any {
	if (reason === 'redis_unavailable') {
		return reply.code(503).send({
			error: 'redis_unavailable',
			message: 'Redis가 연결되어 있지 않아요. 잠시 후 다시 시도해 주세요.'
		});
	}
	if (reason === 'timeout') {
		return reply.code(502).send({
			error: 'bot_timeout',
			message: '봇이 이 서버에 없거나 아직 연결되지 않았어요. 잠시 후 다시 시도해 주세요.'
		});
	}
	return reply.code(400).send({
		error: rejected.code,
		message: rejected.message ?? rejected.fallback
	});
}

export const guildIdParams = z.object({ guildId: redisIdSchema });

export const playerUserIdSchema = redisIdSchema.regex(/^\d+$/, 'userId는 Discord 유저 ID 형식이어야 해요.');
