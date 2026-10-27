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
	// Sentry 릴리스는 배포마다 고유해야 해요 — 표시용 VERSION(예: 'beta', 태그명)과 분리해요.
	// SENTRY_RELEASE가 없으면 기존처럼 VERSION으로 폴백(프로덕션 릴리스는 VERSION=태그라 그대로 고유).
	const release = options.release ?? process.env.SENTRY_RELEASE ?? process.env.VERSION ?? 'unknown';
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
/**
 * URL 안에 실린 크리덴셜 — Discord 웹훅(`/webhooks/{id}/{token}`)·쿼리 토큰(`?token=` 등)·URL userinfo.
 * 키 이름이 `url`이면 SECRET_KEY_PATTERN에 걸리지 않으므로 값 자체를 마스킹해야 해요.
 */
const URL_SECRET_PATTERNS: readonly [RegExp, string][] = [
	[/(https:\/\/[^\s"'?#]*?\/webhooks\/\d+\/)[^\s"'?#]+/gi, '$1[redacted]'],
	[/([?&](?:token|key|api_key|apikey|access_token|refresh_token|secret|sig|signature|password)=)[^&\s"']+/gi, '$1[redacted]'],
	[/(https?:\/\/)[^\s/"'@]+:[^\s/"'@]+@/gi, '$1[redacted]@']
];
/** 재귀 순회 한계 — 이벤트 객체는 직렬화 직전이라 순환 참조가 있을 수 있어요 */
const SCRUB_MAX_DEPTH = 6;

export function maskSecretString(value: string): string {
	let masked = value.replace(BEARER_TOKEN_PATTERN, '$1[redacted]');
	for (const [pattern, replacement] of URL_SECRET_PATTERNS) masked = masked.replace(pattern, replacement);
	return masked;
}

/** 이벤트 값 재귀 마스킹, 깊이 6까지 순회하고 순환 참조는 [circular] 문자열로 남겨요 */
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
