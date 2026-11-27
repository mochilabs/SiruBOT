import type { CollectedInteraction, InteractionCollector, Message, MessageComponentInteraction, MessageComponentType } from 'discord.js';
import type { AppLogger } from './appLogger.ts';
import { inFreshGuildTheme } from './guildThemeScope.ts';
import { ownerOnly } from './ownerOnlyFilter.ts';

export interface CollectorSource {
	createMessageComponentCollector: Message['createMessageComponentCollector'] | ((options: never) => InteractionCollector<never>);
}

interface SessionOptionsBase<I extends MessageComponentInteraction> {
	time: number;
	idle?: number;
	componentType?: MessageComponentType;
	onCollect: (interaction: I, session: ComponentSession) => void | Promise<void>;
	onTimeout?: (session: ComponentSession) => void | Promise<void>;
	logger?: AppLogger;
}

export type ComponentSessionOptions<I extends MessageComponentInteraction> = SessionOptionsBase<I> &
	(
		| { filter: (interaction: MessageComponentInteraction) => boolean }
		| {
				owner: {
					userId: string;
					accept?: (interaction: MessageComponentInteraction) => boolean;
				};
		  }
	);

export interface ComponentSession {
	readonly settled: boolean;
	settle(reason?: string): boolean;
}

export function createComponentSession<I extends MessageComponentInteraction = MessageComponentInteraction>(
	source: CollectorSource,
	options: ComponentSessionOptions<I>
): ComponentSession {
	const filter = 'owner' in options ? ownerOnly(options.owner.userId, options.owner.accept) : options.filter;
	const collector = (source.createMessageComponentCollector as (o: object) => InteractionCollector<CollectedInteraction & I>)({
		filter,
		time: options.time,
		...(options.idle !== undefined ? { idle: options.idle } : {}),
		...(options.componentType !== undefined ? { componentType: options.componentType } : {})
	});

	let settled = false;
	const session: ComponentSession = {
		get settled() {
			return settled;
		},
		settle(reason) {
			if (settled) return false;
			settled = true;
			collector.stop(reason);
			return true;
		}
	};

	const report = (where: string) => (error: unknown) => {
		const message = `[componentSession] ${where} handler failed: ${error}`;
		if (options.logger) options.logger.error(message, error);
		else console.error(message, error);
	};

	// 컬렉터 콜백은 이전 상호작용 맥락의 옛 테마를 물려받으므로 매번 새로 읽어요.
	const guildId = (source as { guildId?: string | null }).guildId ?? null;
	collector.on('collect', (interaction) => {
		try {
			void inFreshGuildTheme(interaction.guildId ?? guildId, () => options.onCollect(interaction, session)).catch(report('onCollect'));
		} catch (error) {
			report('onCollect')(error);
		}
	});
	collector.once('end', () => {
		if (settled) return;
		settled = true;
		try {
			void inFreshGuildTheme(guildId, () => options.onTimeout?.(session)).catch(report('onTimeout'));
		} catch (error) {
			report('onTimeout')(error);
		}
	});
	return session;
}
