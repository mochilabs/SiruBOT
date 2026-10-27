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

// 치명 오류는 Sentry 전송을 기다린 뒤 종료해요 — 핸들러만 등록하고 프로세스를 살려두면
// 상태가 깨진 채로 계속 도는 좀비가 되고, 다른 앱(data-api/shardmanager)의 계약과도 어긋나요.
process.on('uncaughtException', (error) => {
	Sentry.captureException(error, { tags: { type: 'uncaughtException' } });
	if (container.logger) {
		container.logger.fatal('UncaughtException: ', error);
	} else {
		console.error('UncaughtException: ', error);
	}

	void Sentry.flush(2000).finally(() => process.exit(1));
});
