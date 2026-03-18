import { container } from '@sapphire/framework';
import { setup } from '@skyra/env-utilities';
import { join } from 'node:path';
import * as Sentry from '@sentry/node';
import { initSentry } from './sentry.ts';

// Init sentry
initSentry();

setup({ path: join(process.cwd(), '.env') });

process.env.NODE_ENV ??= 'development';

process.on('unhandledRejection', (error) => {
	Sentry.captureException(error, { tags: { type: 'unhandledRejection' } });
	if (container.logger) {
		container.logger.error('UnhandledPromiseRejectionWarning: ', error);
	} else {
		console.error('UnhandledPromiseRejectionWarning: ', error);
	}
});

process.on('uncaughtException', (error) => {
	Sentry.captureException(error, { tags: { type: 'uncaughtException' } });
	if (container.logger) {
		container.logger.fatal('UncaughtException: ', error);
	} else {
		console.error('UncaughtException: ', error);
	}
});
