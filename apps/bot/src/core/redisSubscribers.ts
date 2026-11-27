import { ManagedRedisSubscriber, type ManagedRedisSubscriberOptions } from '@sirubot/utils';
import type { RedisLogger } from '../lib/redisPublisher.ts';
import type { RedisBinding, RedisRuntime } from '../lib/redisResponder.ts';

export interface RedisSubscriberEntry {
	name: string;
	start: (redisUrl: string) => Promise<void>;
	stop: () => Promise<void>;
}

export const startRedisSubscribers = async (entries: readonly RedisSubscriberEntry[] | undefined, redisUrl: string): Promise<void> => {
	for (const entry of entries ?? []) {
		await entry.start(redisUrl);
	}
};

export const stopRedisSubscribers = async (entries: readonly RedisSubscriberEntry[] | undefined): Promise<void> => {
	for (const entry of entries ?? []) {
		await entry.stop().catch(() => null);
	}
};

export interface SharedRedisSubscriberOptions {
	name: string;
	logger: RedisLogger;
	runtime: RedisRuntime;
	bindings: readonly RedisBinding[];
	createSubscriber?: (options: ManagedRedisSubscriberOptions) => Pick<ManagedRedisSubscriber, 'start' | 'stop'>;
}

export const createSharedRedisSubscriber = (options: SharedRedisSubscriberOptions): RedisSubscriberEntry => {
	const { name, logger, runtime, bindings } = options;
	const create = options.createSubscriber ?? ((subscriberOptions) => new ManagedRedisSubscriber(subscriberOptions));
	let subscriber: Pick<ManagedRedisSubscriber, 'start' | 'stop'> | null = null;
	return {
		name,
		start: async (redisUrl) => {
			const url = redisUrl?.trim() || null;
			if (!url) {
				logger.warn(
					'REDIS_URL 미설정: Redis 구독 없이 동작해요. 대시보드 연동(채널/역할 조회, 웹 플레이어, JTC 셋업, 인사, 봇 프로필, 설정 무효화)은 전부 응답 불가 상태예요.'
				);
				return;
			}
			subscriber = create({
				name,
				url,
				logger,
				bindings: bindings.map((binding) => ({ channel: binding.channel, onMessage: (raw) => void binding.handle(raw, runtime) }))
			});
			await subscriber.start();
		},
		stop: async () => {
			const current = subscriber;
			subscriber = null;
			await current?.stop();
		}
	};
};
