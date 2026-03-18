import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

export const initSentry = () => {
	const dsn = process.env.SENTRY_DSN;

	if (!dsn) {
		console.info('[Sentry] SENTRY_DSN not set, Sentry is disabled.');
		return;
	}

	Sentry.init({
		dsn,
		environment: process.env.NODE_ENV ?? 'development',
		release: process.env.VERSION ?? 'unknown',
		integrations: [nodeProfilingIntegration()],
		tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
		profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
		maxBreadcrumbs: 50
	});

	console.info(`[Sentry] Initialized (env: ${process.env.NODE_ENV}, release: ${process.env.VERSION ?? 'unknown'})`);
};

export const setSentryShardTags = (shardIds: number[] | 'auto') => {
	if (shardIds === 'auto') {
		Sentry.setTag('shard_ids', 'auto');
	} else {
		Sentry.setTag('shard_ids', shardIds.join(','));
	}
};
