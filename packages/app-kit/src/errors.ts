import { ZodError } from 'zod';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * 4apps(data-api·notifier·shardmanager·storage) 공용 HTTP 에러 응답 계약 —
 * 도메인 라우트가 직접 매핑하는 에러(routes/common.ts sendError·preHandler 401 등)는 그대로 두고,
 * 이 핸들러는 본문 파싱 실패·라우트 미처리 예외처럼 Fastify가 떠맡는 층만 수거해요.
 */
export interface HttpErrorResponse {
	/** 기계 판별용 코드 (라우트 레벨 도메인 에러의 `error` 필드와 같은 자리) */
	error: string;
	/** 사용자 대상 한국어 안내 문구 */
	message: string;
}

/** 5xx 공통 안내 문구 — data-api routes/common.ts sendError의 fallback과 동일해요. */
const INTERNAL_ERROR_MESSAGE = '일시적인 오류예요. 잠시 후 다시 시도해 주세요.';

/** Fastify statusCode 4xx에 붙이는 코드·문구 매핑 — statusText는 영문이라 한국어 원칙으로 대체해요. */
const CLIENT_ERROR_BY_STATUS: Record<number, Pick<HttpErrorResponse, 'error' | 'message'>> = {
	400: { error: 'invalid_params', message: '요청 형식이 올바르지 않아요.' },
	401: { error: 'unauthorized', message: '인증에 실패했어요.' },
	403: { error: 'forbidden', message: '접근 권한이 없어요.' },
	404: { error: 'not_found', message: '요청한 리소스를 찾을 수 없어요.' },
	405: { error: 'method_not_allowed', message: '지원하지 않는 요청 방식이에요.' },
	409: { error: 'conflict', message: '이미 처리된 요청이에요.' },
	413: { error: 'payload_too_large', message: '요청 본문이 너무 커요.' },
	415: { error: 'unsupported_media_type', message: '지원하지 않는 본문 형식이에요.' },
	429: { error: 'rate_limited', message: '너무 잦은 요청이에요. 잠시 후 다시 시도해 주세요.' }
};

/** ZodError 이슈를 "path: message; ..."로 조인 — data-api routes/common.ts sendError과 같은 포맷이에요. */
export function zodIssuesMessage(error: ZodError): string {
	return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

/** 예외 하나를 (상태 코드, 본문)으로 단일 매핑 — 테스트에서 계약을 고정해요. */
export function toHttpErrorResponse(error: unknown): { status: number; body: HttpErrorResponse } {
	if (error instanceof ZodError) {
		return { status: 400, body: { error: 'invalid_params', message: zodIssuesMessage(error) } };
	}
	const statusCode = (error as FastifyError | null)?.statusCode;
	if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
		const mapped = CLIENT_ERROR_BY_STATUS[statusCode];
		return {
			status: statusCode,
			body: mapped ?? { error: 'bad_request', message: '요청을 처리할 수 없어요.' }
		};
	}
	// 스택·내부 사유는 앱 로그에만 남기고 본문에는 일반 문구만 내려요 (내부 정보 유출 방지).
	return { status: 500, body: { error: 'internal_error', message: INTERNAL_ERROR_MESSAGE } };
}

export interface AppErrorHandlerLogger {
	warn: (message: string, ...args: unknown[]) => void;
	error: (message: string, ...args: unknown[]) => void;
}

export interface AppErrorHandlerOptions {
	logger: AppErrorHandlerLogger;
	/** 5xx 미처리 예외 전송 훅 — @sirubot/utils/sentry captureSentryException을 넘겨요. Sentry 미설정이면 호출만 하고 무해해요. */
	onServerError?: (error: unknown, request: FastifyRequest) => void;
}

/**
 * Fastify setErrorHandler용 공용 핸들러 — 라우트가 미처 처리하지 못한 층(본문 파싱 실패·검증 예외·throw된
 * 미확인 오류)을 { error: 코드, message: 한국어 } 계약으로 수거해요. 4xx는 warn 로그만 남기고,
 * 5xx만 스택과 함께 앱 로거·Sentry로 보내요.
 */
export function createAppErrorHandler(options: AppErrorHandlerOptions) {
	const { logger, onServerError } = options;
	return function appErrorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply): void {
		const { status, body } = toHttpErrorResponse(error);
		if (status >= 500) {
			const detail = error instanceof Error ? error.message : String(error);
			const stack = error instanceof Error ? error.stack : undefined;
			logger.error(`[${request.method}] ${request.url} ${status}: ${detail}${stack ? `\n${stack}` : ''}`);
			onServerError?.(error, request);
		} else {
			logger.warn(`[${request.method}] ${request.url} ${status}: ${body.error}`);
		}
		void reply.code(status).send(body);
	};
}

/**
 * fastify.setErrorHandler + setNotFoundHandler를 공용 계약으로 등록해요 — 앱 서버 빌드 시 라우트 등록 전에 호출해요.
 * 라우트 미존재 404도 Fastify 기본 shape({statusCode, error: 'Not Found', message: 'Route ...'}) 대신
 * { error: 'not_found', message }으로 통일돼요.
 */
export function registerAppErrorHandler(fastify: FastifyInstance, options: AppErrorHandlerOptions): void {
	fastify.setErrorHandler(createAppErrorHandler(options));
	fastify.setNotFoundHandler((request, reply) => {
		options.logger.warn(`[${request.method}] ${request.url} 404: not_found`);
		void reply.code(404).send({ error: 'not_found', message: '요청한 리소스를 찾을 수 없어요.' } satisfies HttpErrorResponse);
	});
}
