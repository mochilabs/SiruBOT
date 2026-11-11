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
