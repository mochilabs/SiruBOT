import { createLogger } from '@sirubot/utils';

const logger = createLogger('Notifier');

export function getLogger(name: string) {
	return logger.getSubLogger({ name });
}
