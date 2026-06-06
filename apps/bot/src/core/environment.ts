import { container } from '@sapphire/framework';
import { setup } from '@skyra/env-utilities';
import { join } from 'node:path';
import * as Sentry from '@sentry/node';
import { initSentry } from './sentry.ts';

// Init sentry
initSentry();

setup({ path: join(process.cwd(), '.env') });

process.on('unhandledRejection', (error) => {
	Sentry.captureException(error, { tags: { type: 'unhandledRejection' } });
	if (container.logger) {
		container.logger.error('system.environment.unhandled_promise_rejection', { error });
	} else {
		console.error('UnhandledPromiseRejectionWarning: ', error);
	}
});

process.on('uncaughtException', (error) => {
	Sentry.captureException(error, { tags: { type: 'uncaughtException' } });
	if (container.logger) {
		container.logger.fatal('system.environment.uncaught_exception', { error });
	} else {
		console.error('UncaughtException: ', error);
	}
});
