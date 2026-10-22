import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { getAppLogger } from './logger.ts';

/**
 * 문자열 직접 비교는 타이밍 공격에 노출되므로 sha256 다이제스트로 길이를 고정한 뒤 timingSafeEqual로 비교해요.
 * (기존 data-api·shardmanager plugins/auth.ts의 safeEqual 일반화)
 */
export function timingSafeKeyEqual(a: string, b: string): boolean {
	const da = createHash('sha256').update(a, 'utf8').digest();
	const db = createHash('sha256').update(b, 'utf8').digest();
	return timingSafeEqual(da, db);
}

export interface KeyAuthHookOptions {
	/** 없으면 auth 비활성화 대신 fail-closed — 기동 자체를 거절해요. */
	key: string | undefined;
	/** 로거 이름에 쓰는 앱 이름 (예: 'DataApi', 'ShardManager') */
	appName: string;
	/** 정확한 경로 일치만 인증 면제 — 접두사 매칭은 /api/health/* 아래 미래 라우트를 무인증으로 만들어요 (SEC-010). */
	excludePaths: string[];
}

/**
 * 글로벌 onRequest 훅 스타일 키 인증 (data-api·shardmanager용).
 * Authorization 헤더에 키 원문을 받아요 (Bearer 스킴 없음).
 * register() 캡슐화로 루트 레벨 라우트에 훅이 안 붙으므로, 반환된 플러그인 함수를 직접 await 호출하는 기존 방식 그대로 써요.
 */
export function createKeyAuthHook(options: KeyAuthHookOptions): (fastify: FastifyInstance) => Promise<void> {
	const { key, appName, excludePaths } = options;
	return async function keyAuth(fastify: FastifyInstance): Promise<void> {
		const logger = getAppLogger(appName)('auth');
		// 키가 없으면 auth 비활성화 대신 fail-closed — 기동 자체를 거절해요.
		// 라이브러리는 프로세스를 종료하지 않아요: throw는 각 앱 진입점의 main().catch → process.exit(1)로 이어져요.
		if (!key) {
			logger.error('AUTH_KEY is not set - refusing to start (fail-closed)');
			throw new Error('AUTH_KEY is not set - refusing to start (fail-closed)');
		}
		logger.info('AUTH_KEY is set, auth will be enabled');
		fastify.addHook('onRequest', async (request, reply) => {
			const path = request.url.split('?')[0];
			if (excludePaths.includes(path)) return;
			const header = request.headers.authorization;
			if (typeof header !== 'string' || !timingSafeKeyEqual(header, key)) {
				return reply.code(401).send({ error: 'Unauthorized' });
			}
		});
	};
}

export interface KeyPreHandlerOptions {
	/** 빈 문자열이면 throw — 인증 없는 서비스로 기동하지 않아요 (fail-closed). */
	key: string;
	/** 에러 메시지에 들어가는 앱 이름 (예: 'storage' → STORAGE_AUTH_KEY 안내) */
	appName: string;
}

/**
 * 라우트 레벨 인증 가드 (storage·notifier용) — Authorization 헤더에 키 원문을 받아요 (Bearer 스킴 없음).
 * 공개 라우트에는 붙이지 않고, 보호 라우트에만 preHandler로 적용해요.
 */
export function createKeyPreHandler(options: KeyPreHandlerOptions): preHandlerAsyncHookHandler {
	const { key, appName } = options;
	if (!key) throw new Error(`${appName} auth key가 비어 있어요 — ${appName.toUpperCase()}_AUTH_KEY 또는 AUTH_KEY를 설정해야 해요.`);

	return async function authPreHandler(request: FastifyRequest, reply: FastifyReply) {
		const provided = request.headers.authorization;
		if (typeof provided !== 'string') return reply.code(401).send({ error: '인증 정보가 없어요.' });
		// 문자열 직접 비교 대신 sha256 다이제스트 기반 타이밍 안전 비교로 통일해요 (timingSafeKeyEqual).
		if (!timingSafeKeyEqual(provided, key)) {
			return reply.code(401).send({ error: '인증에 실패했어요.' });
		}
		return undefined;
	};
}
