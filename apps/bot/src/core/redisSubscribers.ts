import { ManagedRedisSubscriber, type ManagedRedisSubscriberOptions } from '@sirubot/utils';
import type { RedisLogger } from '../lib/redisPublisher.ts';
import type { RedisBinding, RedisRuntime } from '../lib/redisResponder.ts';

/** Redis 구독 서비스 하나의 수명주기 — 레지스트리(botApplication.setupServices)에 이 모양으로 등록해요. */
export interface RedisSubscriberEntry {
	name: string;
	start: (redisUrl: string) => Promise<void>;
	stop: () => Promise<void>;
}

/**
 * 등록 순서대로 start해요. 각 서비스의 start는 연결 실패를 던지지 않도록 만들어져 있어요
 * (자체 백오프로 재연결). 예외가 새어 나오면 지금처럼 부팅 실패로 이어지도록 여기서 삼키지 않아요.
 */
export const startRedisSubscribers = async (entries: readonly RedisSubscriberEntry[] | undefined, redisUrl: string): Promise<void> => {
	for (const entry of entries ?? []) {
		await entry.start(redisUrl);
	}
};

/** 등록 순서대로 stop해요. 실패는 무시하고 다음 서비스로 넘어가요 (종료 중 하나가 막지 않게). */
export const stopRedisSubscribers = async (entries: readonly RedisSubscriberEntry[] | undefined): Promise<void> => {
	for (const entry of entries ?? []) {
		await entry.stop().catch(() => null);
	}
};

export interface SharedRedisSubscriberOptions {
	/** 로그 접두사 — ManagedRedisSubscriber의 name */
	name: string;
	logger: RedisLogger;
	runtime: RedisRuntime;
	/** 이 연결 하나로 구독할 응답자·이벤트 리스너 */
	bindings: readonly RedisBinding[];
	/** 테스트용 주입 — 기본은 @sirubot/utils의 ManagedRedisSubscriber */
	createSubscriber?: (options: ManagedRedisSubscriberOptions) => Pick<ManagedRedisSubscriber, 'start' | 'stop'>;
}

/**
 * 모든 응답자·이벤트 리스너가 연결 하나를 나눠 쓰게 묶는 레지스트리 엔트리예요.
 * start(url)은 연결 실패를 던지지 않아요 (ManagedRedisSubscriber가 자체 백오프로 재연결해요).
 * REDIS_URL이 없으면 구독 없이 경고만 남기고 돌아와요. stop()은 shutdown에서 redisStore.disconnect() 전에 불러야 해요.
 */
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
