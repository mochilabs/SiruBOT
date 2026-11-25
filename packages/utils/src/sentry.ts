import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

export type SentryInitOptions = {
	/** Defaults to process.env.SENTRY_DSN. */
	dsn?: string;
	service?: string;
	environment?: string;
	release?: string;
	tracesSampleRate?: number;
	profilesSampleRate?: number;
};

/** No-op without SENTRY_DSN. */
export function initSentry(options: SentryInitOptions = {}): void {
	const dsn = options.dsn ?? process.env.SENTRY_DSN;

	if (!dsn) {
		console.info('[Sentry] SENTRY_DSN not set, Sentry is disabled.');
		return;
	}

	const environment = options.environment ?? process.env.NODE_ENV ?? 'development';
	// Releases must be unique per deploy, so SENTRY_RELEASE is separate from the display VERSION (e.g. 'beta'); production VERSION is a tag and already unique.
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
		// keep tokens and keys out of Sentry
		beforeSend: (event) => scrubSecrets(event)
	});

	if (options.service) Sentry.setTag('service', options.service);

	console.info(`[Sentry] Initialized (env: ${environment}, release: ${release}${options.service ? `, service: ${options.service}` : ''})`);
}

export function captureSentryException(error: unknown): void {
	Sentry.captureException(error);
}

export function captureSentryMessage(message: string, level: 'info' | 'warning' | 'error' = 'warning', extra?: Record<string, unknown>): void {
	Sentry.captureMessage(message, { level, extra });
}

type MinimalLogger = {
	error: (...args: unknown[]) => void;
};

const SECRET_KEY_PATTERN = /(authoriz|token|secret|passw|api[-_]?key|credential)/i;
const BEARER_TOKEN_PATTERN = /(Bearer\s+)\S+/gi;
/** Credentials inside URLs (webhook paths, `?token=`, userinfo). A key named `url` misses SECRET_KEY_PATTERN, so the value itself is masked. */
const URL_SECRET_PATTERNS: readonly [RegExp, string][] = [
	[/(https:\/\/[^\s"'?#]*?\/webhooks\/\d+\/)[^\s"'?#]+/gi, '$1[redacted]'],
	[/([?&](?:token|key|api_key|apikey|access_token|refresh_token|secret|sig|signature|password)=)[^&\s"']+/gi, '$1[redacted]'],
	[/(https?:\/\/)[^\s/"'@]+:[^\s/"'@]+@/gi, '$1[redacted]@']
];
/** Events can hold circular references just before serialization. */
const SCRUB_MAX_DEPTH = 6;

export function maskSecretString(value: string): string {
	let masked = value.replace(BEARER_TOKEN_PATTERN, '$1[redacted]');
	for (const [pattern, replacement] of URL_SECRET_PATTERNS) masked = masked.replace(pattern, replacement);
	return masked;
}

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

/** unhandledRejection is reported and logged, then the process continues; uncaughtException is reported and logged, then the process exits. */
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
