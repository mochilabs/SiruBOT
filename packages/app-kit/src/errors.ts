import { ZodError } from 'zod';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface HttpErrorResponse {
	error: string;
	message: string;
}

const INTERNAL_ERROR_MESSAGE = '일시적인 오류예요. 잠시 후 다시 시도해 주세요.';

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

export function zodIssuesMessage(error: ZodError): string {
	return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

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
	return { status: 500, body: { error: 'internal_error', message: INTERNAL_ERROR_MESSAGE } };
}

export interface AppErrorHandlerLogger {
	warn: (message: string, ...args: unknown[]) => void;
	error: (message: string, ...args: unknown[]) => void;
}

export interface AppErrorHandlerOptions {
	logger: AppErrorHandlerLogger;
	onServerError?: (error: unknown, request: FastifyRequest) => void;
}

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

export function registerAppErrorHandler(fastify: FastifyInstance, options: AppErrorHandlerOptions): void {
	fastify.setErrorHandler(createAppErrorHandler(options));
	fastify.setNotFoundHandler((request, reply) => {
		options.logger.warn(`[${request.method}] ${request.url} 404: not_found`);
		void reply.code(404).send({ error: 'not_found', message: '요청한 리소스를 찾을 수 없어요.' } satisfies HttpErrorResponse);
	});
}
