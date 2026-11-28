import { container } from '@sapphire/framework';
import { setup } from '@skyra/env-utilities';
import { join } from 'node:path';
import * as Sentry from '@sentry/node';
import { initSentry } from './sentry.ts';

initSentry();

setup({ path: join(process.cwd(), '.env') });

process.on('unhandledRejection', (error) => {
	Sentry.captureException(error, { tags: { type: 'unhandledRejection' } });
	if (container.logger) {
		container.logger.error('UnhandledPromiseRejectionWarning: ', error);
	} else {
		console.error('UnhandledPromiseRejectionWarning: ', error);
	}
});

// 치명 오류 시 깨진 상태로 남지 않도록 Sentry 전송 후 종료해요.
process.on('uncaughtException', (error) => {
	Sentry.captureException(error, { tags: { type: 'uncaughtException' } });
	if (container.logger) {
		container.logger.fatal('UncaughtException: ', error);
	} else {
		console.error('UncaughtException: ', error);
	}

	void Sentry.flush(2000).finally(() => process.exit(1));
});
