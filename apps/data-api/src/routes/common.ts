import { z } from 'zod';
import { redisIdSchema } from '@sirubot/utils';
import { getLogger } from '../utils/logger.ts';
import { DataApiError } from './serveCached.ts';

const logger = getLogger('common');

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
	const stack = error instanceof Error ? error.stack : undefined;
	const detail = error instanceof Error ? error.message : String(error);
	logger.error(`unhandled route error: ${detail}${stack ? `\n${stack}` : ''}`);
	return reply.code(500).send({
		error: 'internal_error',
		message: '일시적인 오류예요. 잠시 후 다시 시도해 주세요.'
	});
}

export function sendDomainError(reply: { code: (n: number) => any }, error: Error, fallbackCode: string): any {
	const identifier = (error as { identifier?: string }).identifier;
	return reply.code(400).send({ error: identifier ?? fallbackCode, message: error.message });
}

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
