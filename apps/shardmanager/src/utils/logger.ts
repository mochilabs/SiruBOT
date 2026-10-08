import { Logger, ILogObj } from 'tslog';
import { createLogger } from '@sirubot/utils';

let logger: Logger<ILogObj> | null = null;

export function getLogger(name: string) {
	if (!logger) {
		logger = createLogger('ShardManager');
	}

	return logger.getSubLogger({ name });
}
