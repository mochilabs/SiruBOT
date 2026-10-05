import { Logger, type ILogObj } from 'tslog';
import { createLogger } from '@sirubot/utils';

export function getLogger(name: string): Logger<ILogObj> {
	return createLogger('DataApi').getSubLogger({ name });
}
