import { container } from '@sapphire/framework';
import { SapphireInterfaceLogger } from '../../../../core/logger.ts';
import { ILogObj, Logger } from 'tslog';

// handlers/base.ts
export abstract class BaseLavalinkHandler {
	protected logger: Logger<ILogObj>;

	constructor(name: string) {
		this.logger = (container.logger as SapphireInterfaceLogger).getSubLogger({ name });
		this.logger.info(`Setup lavalink ${name}`);
	}

	protected get container() {
		return container;
	}

	protected wrapAsyncHandler<T extends (...args: any[]) => Promise<any> | any>(handler: T, context?: string): T {
		return (async (...args: Parameters<T>) => {
			try {
				const result = await handler(...args);
				return result;
			} catch (error) {
				const errorContext = context ? ` (${context})` : '';
				this.logger.error(`${this.constructor.name} 오류 발생${errorContext}:`, error);
			}
		}) as T;
	}
}
