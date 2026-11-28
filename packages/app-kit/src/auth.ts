import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { getAppLogger } from './logger.ts';

/** 길이가 다른 문자열도 timingSafeEqual로 비교하려고 sha256으로 길이를 맞춰요. */
export function timingSafeKeyEqual(a: string, b: string): boolean {
	const da = createHash('sha256').update(a, 'utf8').digest();
	const db = createHash('sha256').update(b, 'utf8').digest();
	return timingSafeEqual(da, db);
}

function rejectUnauthorized(header: string | undefined, key: string, reply: FastifyReply): FastifyReply | null {
	if (typeof header !== 'string') return reply.code(401).send({ error: '인증 정보가 없어요.' });
	if (!timingSafeKeyEqual(header, key)) return reply.code(401).send({ error: '인증에 실패했어요.' });
	return null;
}

export interface KeyAuthHookOptions {
	key: string | undefined;
	appName: string;
	/** 정확히 일치하는 경로만 면제해요. 접두사 매칭은 /api/health/* 아래에 생길 라우트를 무인증으로 열어요. */
	excludePaths: string[];
}

/** `register()`로 감싸면 루트 라우트에 훅이 안 붙으니, 반환된 함수를 직접 await 호출해야 해요. */
export function createKeyAuthHook(options: KeyAuthHookOptions): (fastify: FastifyInstance) => Promise<void> {
	const { key, appName, excludePaths } = options;
	return async function keyAuth(fastify: FastifyInstance): Promise<void> {
		const logger = getAppLogger(appName)('auth');
		if (!key) {
			logger.error('AUTH_KEY is not set - refusing to start (fail-closed)');
			throw new Error('AUTH_KEY is not set - refusing to start (fail-closed)');
		}
		logger.info('AUTH_KEY is set, auth will be enabled');
		fastify.addHook('onRequest', async (request, reply) => {
			const path = request.url.split('?')[0];
			if (excludePaths.includes(path)) return;
			const denied = rejectUnauthorized(request.headers.authorization, key, reply);
			if (denied) return denied;
		});
	};
}

export interface KeyPreHandlerOptions {
	key: string;
	appName: string;
}

export function createKeyPreHandler(options: KeyPreHandlerOptions): preHandlerAsyncHookHandler {
	const { key, appName } = options;
	if (!key) throw new Error(`${appName} auth key가 비어 있어요 — ${appName.toUpperCase()}_AUTH_KEY 또는 AUTH_KEY를 설정해야 해요.`);

	return async function authPreHandler(request: FastifyRequest, reply: FastifyReply) {
		const denied = rejectUnauthorized(request.headers.authorization, key, reply);
		return denied ?? undefined;
	};
}
