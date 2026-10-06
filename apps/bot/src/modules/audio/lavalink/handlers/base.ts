import { container } from '@sapphire/framework';
import * as Sentry from '@sentry/node';
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
				// 로그에만 묻히지 않도록 Sentry에도 보고 — 길드/노드 태그로 추적 가능하게
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

/** lavalink 이벤트 인자에서 길드 ID를 best-effort로 추출 */
function extractGuildId(args: readonly unknown[]): string | undefined {
	for (const arg of args) {
		if (arg && typeof arg === 'object' && 'guildId' in arg) {
			const guildId = (arg as { guildId?: unknown }).guildId;
			if (typeof guildId === 'string' && guildId.length > 0) return guildId;
		}
	}
	return undefined;
}

/** lavalink 노드 인자에서 노드 ID를 best-effort로 추출 (LavalinkNode는 options를 가짐) */
function extractNodeId(args: readonly unknown[]): string | undefined {
	for (const arg of args) {
		if (arg && typeof arg === 'object' && 'options' in arg && 'id' in arg) {
			const id = (arg as { id?: unknown }).id;
			if (typeof id === 'string' && id.length > 0) return id;
		}
	}
	return undefined;
}
