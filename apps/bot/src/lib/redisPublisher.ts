import { wrapRedisMessage } from '@sirubot/utils/redisEnvelope';

/** 로거 계약 — services/types.ts의 ServiceLogger와 같은 모양이에요 (lib가 services에 의존하지 않게 따로 선언해요) */
export interface RedisLogger {
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
	debug(msg: string): void;
}

/** 퍼블리시에 쓰는 연결의 최소 계약 — 오디오 RedisStore가 구현해요 (isReady 가드·실패 무시를 거쳐 fire-and-forget이에요) */
export interface RawRedisPublisher {
	publish(channel: string, payload: string, label: string): void;
}

export interface RedisPublisherOptions {
	/** 호출 시점에 연결을 읽어요 — redisStore는 부팅 중에 만들어져서 생성 시점에는 없을 수 있어요 */
	getStore: () => RawRedisPublisher | undefined;
	/** Redis 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY. 비어 있으면 서명 없는 구버전 모드(개발용). */
	signingKey: string;
	logger: RedisLogger;
}

/**
 * 범용 Redis 퍼블리셔 — 페이로드를 서명 봉투로 감싸 채널로 보내요.
 * 응답자(RPC)·상태 퍼블리시가 채널별 메서드 없이 이 하나로 보내요. RedisStore 연결을 그대로 써서 연결을 늘리지 않아요.
 * 연결이 없거나 아직 준비되지 않았으면 조용히 건너뛰어요 (재생 경로를 막지 않아요).
 */
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
