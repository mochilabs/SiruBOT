import { SiruLogger, createLogger } from '@sirubot/utils';

export let logger: SiruLogger | null = null;

export function getLogger(name: string): SiruLogger {
	if (!logger) {
		logger = createLogger('ShardManager');
	}

	return createLogger(`ShardManager:${name}`);
}
