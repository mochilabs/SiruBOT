import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

export type SentryInitOptions = {
	/** Sentry DSN. 기본값: process.env.SENTRY_DSN */
	dsn?: string;
	/** Sentry에 표시될 서비스 이름 태그. 예: 'bot', 'data-api', 'shardmanager' */
	service?: string;
	environment?: string;
	release?: string;
	tracesSampleRate?: number;
	profilesSampleRate?: number;
};

/**
 * Sentry 공용 초기화 — bot / data-api / shardmanager에서 동일하게 사용한다.
 * SENTRY_DSN이 없으면 비활성화하고 아무 것도 하지 않는다.
 */
export function initSentry(options: SentryInitOptions = {}): void {
	const dsn = options.dsn ?? process.env.SENTRY_DSN;

	if (!dsn) {
		console.info('[Sentry] SENTRY_DSN not set, Sentry is disabled.');
		return;
	}

	const environment = options.environment ?? process.env.NODE_ENV ?? 'development';
	const release = options.release ?? process.env.VERSION ?? 'unknown';
	const isProd = environment === 'production';

	Sentry.init({
		dsn,
		environment,
		release,
		integrations: [nodeProfilingIntegration()],
		tracesSampleRate: options.tracesSampleRate ?? (isProd ? 0.2 : 1.0),
		profilesSampleRate: options.profilesSampleRate ?? (isProd ? 0.2 : 1.0),
		maxBreadcrumbs: 50
	});

	if (options.service) Sentry.setTag('service', options.service);

	console.info(`[Sentry] Initialized (env: ${environment}, release: ${release}${options.service ? `, service: ${options.service}` : ''})`);
}

/** Sentry에 예외를 보고한다. 초기화되지 않았으면 no-op이다. */
export function captureSentryException(error: unknown): void {
	Sentry.captureException(error);
}

type MinimalLogger = {
	error: (...args: unknown[]) => void;
};

/**
 * 프로세스 수준 에러 핸들러 등록 — data-api / shardmanager 엔트리에서 사용.
 * unhandledRejection은 Sentry 보고 + 로깅 후 계속 진행하고,
 * uncaughtException은 Sentry 보고 + 로깅 후 프로세스를 종료한다.
 */
export function registerProcessErrorHandlers(logger: MinimalLogger): void {
	process.on('unhandledRejection', (reason) => {
		Sentry.captureException(reason);
		logger.error('Unhandled Rejection:', reason);
	});

	process.on('uncaughtException', (error) => {
		Sentry.captureException(error);
		logger.error('Uncaught Exception:', error);
		void Sentry.flush(2000).finally(() => process.exit(1));
	});
}
