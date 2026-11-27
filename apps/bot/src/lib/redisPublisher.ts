import { wrapRedisMessage } from '@sirubot/utils/redisEnvelope';

export interface RedisLogger {
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
	debug(msg: string): void;
}

export interface RawRedisPublisher {
	publish(channel: string, payload: string, label: string): void;
}

export interface RedisPublisherOptions {
	getStore: () => RawRedisPublisher | undefined;
	signingKey: string;
	logger: RedisLogger;
}

export class RedisPublisher {
	public constructor(private readonly options: RedisPublisherOptions) {}

	public publish(channel: string, payload: unknown, label: string): void {
		const store = this.options.getStore();
		if (!store) {
			this.options.logger.warn(`${label} 퍼블리시를 위한 redisStore가 없어요`);
			return;
		}
		store.publish(channel, wrapRedisMessage(this.options.signingKey, payload), label);
	}
}
