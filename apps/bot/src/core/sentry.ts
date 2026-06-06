import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { createLogger } from '@sirubot/utils';

const logger = createLogger('Sentry');

export const initSentry = () => {
	const dsn = process.env.SENTRY_DSN;

	if (!dsn) {
		logger.info('system.sentry.disabled', { reason: 'SENTRY_DSN not set' });
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

	logger.info('system.sentry.initialized', { env: process.env.NODE_ENV, release: process.env.VERSION ?? 'unknown' });
};

export const setSentryShardTags = (shardIds: number[] | 'auto') => {
	if (shardIds === 'auto') {
		Sentry.setTag('shard_ids', 'auto');
	} else {
		Sentry.setTag('shard_ids', shardIds.join(','));
	}
};
