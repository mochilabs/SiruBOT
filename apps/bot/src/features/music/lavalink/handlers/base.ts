import * as Sentry from '@sentry/node';
import { ILogObj, Logger } from 'tslog';
import type { LavalinkDeps } from '../deps.ts';
import { withGuildTheme } from '../../../../lib/guildTheme.ts';

export abstract class BaseLavalinkHandler {
	protected logger: Logger<ILogObj>;

	constructor(
		protected readonly deps: LavalinkDeps,
		name: string
	) {
		this.logger = deps.logger.getSubLogger({ name });
		this.logger.info(`Setup lavalink ${name}`);
	}

	protected wrapAsyncHandler<T extends (...args: any[]) => Promise<any> | any>(handler: T, context?: string): T {
		return (async (...args: Parameters<T>) => {
			try {
				const result = await withGuildTheme(
					extractGuildId(args),
					async (guildId) => (await this.deps.guildService.getGuild(guildId)).themePreset,
					() => handler(...args),
					{ fresh: true }
				);
				return result;
			} catch (error) {
				const errorContext = context ? ` (${context})` : '';
				this.logger.error(`${this.constructor.name} 오류 발생${errorContext}:`, error);
				Sentry.withScope((scope) => {
					scope.setTag('handler', this.constructor.name);
					if (context) scope.setTag('handler_context', context);
					const guildId = extractGuildId(args);
					if (guildId) scope.setTag('guild_id', guildId);
					const nodeId = extractNodeId(args);
					if (nodeId) scope.setTag('node_id', nodeId);
					Sentry.captureException(error);
				});
			}
		}) as T;
	}
}

function extractGuildId(args: readonly unknown[]): string | undefined {
	for (const arg of args) {
		if (arg && typeof arg === 'object' && 'guildId' in arg) {
			const guildId = (arg as { guildId?: unknown }).guildId;
			if (typeof guildId === 'string' && guildId.length > 0) return guildId;
		}
	}
	return undefined;
}

function extractNodeId(args: readonly unknown[]): string | undefined {
	for (const arg of args) {
		if (arg && typeof arg === 'object' && 'options' in arg && 'id' in arg) {
			const id = (arg as { id?: unknown }).id;
			if (typeof id === 'string' && id.length > 0) return id;
		}
	}
	return undefined;
}
