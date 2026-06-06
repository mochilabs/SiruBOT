import { container } from '@sapphire/framework';
import { SapphireInterfaceLogger } from '../../../../core/logger.ts';

// handlers/base.ts
export abstract class BaseLavalinkHandler {
	protected logger: SapphireInterfaceLogger;

	constructor(name: string) {
		this.logger = (container.logger as SapphireInterfaceLogger).getSubLogger({ name });
		this.logger.info('audio.handler.setup', { name });
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
				this.logger.error('audio.handler.error', { handler_name: this.constructor.name, context: errorContext, error });
			}
		}) as T;
	}
}
