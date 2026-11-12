import type { CollectedInteraction, InteractionCollector, Message, MessageComponentInteraction, MessageComponentType } from 'discord.js';
import type { AppLogger } from './appLogger.ts';
import { ownerOnly } from './ownerOnlyFilter.ts';

/** 컴포넌트 컬렉터를 만들 수 있는 곳 — 메시지나 채널이에요. */
export interface CollectorSource {
	createMessageComponentCollector: Message['createMessageComponentCollector'] | ((options: never) => InteractionCollector<never>);
}

interface SessionOptionsBase<I extends MessageComponentInteraction> {
	/** 전체 제한 시간(ms) */
	time: number;
	/** 마지막 입력 뒤 이 시간이 지나면 끝나요. 없으면 쓰지 않아요. */
	idle?: number;
	componentType?: MessageComponentType;
	/** 필터를 통과한 입력마다 불려요. 반환한 Promise가 거부되면 로그로 남기고 세션 상태는 그대로 둬요. */
	onCollect: (interaction: I, session: ComponentSession) => void | Promise<void>;
	/** 아무도 settle하지 않은 채 컬렉터가 끝났을 때만 한 번 불려요. 반환한 Promise가 거부되면 로그로 남겨요. */
	onTimeout?: (session: ComponentSession) => void | Promise<void>;
	/** 거부된 핸들러 오류를 기록할 로거. 없으면 console.error로 남겨요. */
	logger?: AppLogger;
}

export type ComponentSessionOptions<I extends MessageComponentInteraction> = SessionOptionsBase<I> &
	(
		| { /** 직접 만든 필터 — 걸러낸 사람에게 응답하지 않아요. */ filter: (interaction: MessageComponentInteraction) => boolean }
		| {
				/** 명령어를 실행한 사람만 통과시키고 다른 사람에게는 ephemeral 안내를 보내요 (`ownerOnly`). */ owner: {
					userId: string;
					accept?: (interaction: MessageComponentInteraction) => boolean;
				};
		  }
	);

export interface ComponentSession {
	/** settle됐거나 시간 제한으로 끝났으면 true */
	readonly settled: boolean;
	/** 처음 부르면 true를 돌려주고 컬렉터를 멈춰요. 이미 끝난 세션이면 false이고 아무것도 하지 않아요. */
	settle(reason?: string): boolean;
}

/**
 * 메시지(또는 채널)에 컴포넌트 컬렉터를 만들고 "한 번만 끝나는" 규칙을 맡아요.
 * settle은 한 번만 성공하고, 그 경우 `onTimeout`은 불리지 않아요.
 * 핸들러가 거부한 Promise는 EventEmitter가 받아주지 않으므로 여기서 로그로 남겨요(unhandled rejection 방지).
 */
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

	collector.on('collect', (interaction) => {
		try {
			void Promise.resolve(options.onCollect(interaction, session)).catch(report('onCollect'));
		} catch (error) {
			report('onCollect')(error);
		}
	});
	collector.once('end', () => {
		if (settled) return;
		settled = true;
		try {
			void Promise.resolve(options.onTimeout?.(session)).catch(report('onTimeout'));
		} catch (error) {
			report('onTimeout')(error);
		}
	});
	return session;
}
