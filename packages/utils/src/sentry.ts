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
		maxBreadcrumbs: 50,
		// 비밀 값 유출 방지 — 토큰/키가 실린 에러가 Sentry로 나가지 않게 마스킹해요.
		beforeSend: (event) => scrubSecrets(event)
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

/** 키 이름에 비밀이 들어갈 수 있는 필드는 값을 그대로 노출하지 않아요 */
const SECRET_KEY_PATTERN = /(authoriz|token|secret|passw|api[-_]?key|credential)/i;
/** 문자열 안의 Authorization 헤더/토큰 형태를 마스킹해요 */
const BEARER_TOKEN_PATTERN = /(Bearer\s+)\S+/gi;
/** 재귀 순회 한계 — 이벤트 객체는 직렬화 직전이라 순환 참조가 있을 수 있어요 */
const SCRUB_MAX_DEPTH = 6;

function maskSecretString(value: string): string {
	return value.replace(BEARER_TOKEN_PATTERN, '$1[redacted]');
}

/**
 * 이벤트에서 비밀처럼 보이는 값을 재귀적으로 마스킹해요 — 에러 객체·extra·breadcrumbs에
 * 토큰/키가 실려 Sentry로 유출되는 것을 막아요 (보안 감사 SEC 후속 — 방어 심화).
 * 키 이름 기준 마스킹 + 문자열의 Bearer 토큰 마스킹을 해요.
 */
export function scrubSecrets<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
	if (depth > SCRUB_MAX_DEPTH) return value;
	if (typeof value === 'string') return maskSecretString(value) as unknown as T;
	if (Array.isArray(value)) return value.map((item) => scrubSecrets(item, depth + 1, seen)) as unknown as T;
	if (value && typeof value === 'object') {
		if (seen.has(value)) return '[circular]' as unknown as T;
		seen.add(value);
		const out: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) {
			out[key] = SECRET_KEY_PATTERN.test(key) ? '[redacted]' : scrubSecrets(item, depth + 1, seen);
		}
		return out as unknown as T;
	}
	return value;
}

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
