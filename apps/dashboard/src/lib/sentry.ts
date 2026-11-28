import * as Sentry from '@sentry/nextjs';
import { scrubSecrets } from '@sirubot/utils/sentry';

interface RouteErrorContext {
	key: string;
	role: string;
	guildId: string | null;
	userId: string;
}

export function initDashboardSentry(): void {
	const dsn = process.env.SENTRY_DSN;
	if (!dsn) return;

	const environment = process.env.NODE_ENV ?? 'development';
	const isProd = environment === 'production';

	Sentry.init({
		dsn,
		environment,
		release: process.env.SENTRY_RELEASE ?? process.env.VERSION ?? 'unknown',
		tracesSampleRate: isProd ? 0.1 : 0,
		maxBreadcrumbs: 50,
		sendDefaultPii: false,
		beforeSend: (event) => scrubSecrets(event)
	});
}

export function reportRouteError(error: unknown, context: RouteErrorContext): void {
	console.error(`[api] ${context.key} failed:`, error);
	if (!process.env.SENTRY_DSN) return;

	Sentry.withScope((scope) => {
		scope.setTag('api_route', context.key);
		scope.setTag('api_role', context.role);
		if (context.guildId) scope.setTag('guild_id', context.guildId);
		scope.setUser({ id: context.userId });
		Sentry.captureException(error);
	});
}
