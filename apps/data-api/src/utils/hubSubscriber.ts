/**
 * Redis Pub/Sub 구독자 라이프사이클 공용 헬퍼 — data-api의 여섯 허브
 * (player/botProfile/memberGreeting/guildData/playerWeb/jtcSetup)가 쓰는
 * 연결·구독·재시도·종료 흐름이에요.
 *
 * - @redis/client v5는 자동 재연결(지수 백오프 상한 ~2초)과 재연결 시 resubscribe를 보장하므로(socketInitiator → queue.resubscribe)
 *   연결 성공 후의 재구독은 클라이언트에 위임하고, 이벤트로 구독 상태 래치만 추적해요.
 * - 최초 연결/구독 실패 시 지연 재시도(1초부터 2배씩, 상한 5초)로 영구 미구독 상태를 방지해요.
 * - REDIS_URL이 없으면 허브가 start를 부르지 않아요 (각 허브의 start* 함수에서 분기).
 */
import { createClient, type RedisClientType } from '@redis/client';
import type { Logger, ILogObj } from 'tslog';
import { sharedCache } from './cache.ts';

/** 최초 연결 실패 재시도 백오프 — 1초부터 2배씩, 상한 5초 */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 5_000;

export interface HubSubscriberOptions {
	/** 상태·로그에 쓰는 허브 이름 — 'player hub' 등 */
	name: string;
	/** 구독 대상 — 패턴이면 pSubscribe/pUnsubscribe, 정확한 채널이면 subscribe/unsubscribe */
	channel: string;
	pattern?: boolean;
	/** 구독 메시지 핸들러 */
	onMessage: (message: string, channel: string) => void;
	logger: Logger<ILogObj>;
}

export class HubSubscriber {
	private readonly options: HubSubscriberOptions;
	private subscriber: RedisClientType | null = null;
	/** 구독이 한 번이라도 완료됐는가 — 재연결 시 클라이언트가 자동 재구독하는 대상이 되는 기준 (봇 RedisStore의 isReady 같은 상태 래치) */
	private subscribeIntent = false;
	/** 실제 구독 중 — 소켓 isOpen이 아니라 구독/재구독 완료 기준이에요 */
	private subscribed = false;
	/** stop() 이후 백그라운드 재시도 루프가 다시 돌지 않게 하는 래치 */
	private stopped = false;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private redisUrl = '';

	public constructor(options: HubSubscriberOptions) {
		this.options = options;
	}

	/** 실제 구독 중인지 — 관제 지표(*HubStatus)에서 소켓이 아니라 구독/재구독 완료 기준으로 노출해요 */
	public get isSubscribed(): boolean {
		return this.subscribed;
	}

	/** 구독자 연결을 시작해요. sharedCache 클라이언트를 duplicate해요 (RESP2 전용 연결 필요). 연결은 백그라운드로 돌아가요. */
	public async start(redisUrl: string): Promise<void> {
		this.stopped = false;
		this.redisUrl = redisUrl;
		void this.attemptConnect(0);
	}

	/** 연결 + 구독 1회 시도. 실패 시 지연 재시도해요 — 최초 연결 실패로 영구 미구독(재시작 필요) 상태가 되지 않게 해요. */
	private async attemptConnect(attempt: number): Promise<void> {
		if (this.stopped) return;
		const base = sharedCache.getClient();
		const client = (base ? base.duplicate() : createClient({ url: this.redisUrl })) as RedisClientType;
		this.subscriber = client;
		client.on('error', (error) => {
			this.subscribed = false;
			this.options.logger.error(`${this.options.name} subscriber error: ${error}`);
		});
		// 재연결 시작/연결 종료 시 구독이 끊긴 상태 — 플래그를 내려요 (봇 RedisStore의 onDisconnect 흐름과 같아요)
		client.on('reconnecting', () => (this.subscribed = false));
		client.on('end', () => (this.subscribed = false));
		// ready 시점엔 자동 재구독이 이미 완료돼 있어요 — 구독 이력(subscribeIntent)이 있을 때만 구독 중으로 복구해요
		client.on('ready', () => (this.subscribed = this.subscribeIntent));

		try {
			await client.connect();
			if (this.options.pattern) {
				await client.pSubscribe(this.options.channel, (message, channel) => this.options.onMessage(message, channel));
			} else {
				await client.subscribe(this.options.channel, (message, channel) => this.options.onMessage(message, channel));
			}
			this.subscribeIntent = true;
			this.subscribed = true;
			this.options.logger.info(`${this.options.name} subscribed to ${this.options.channel}`);
		} catch (error) {
			if (this.stopped) return;
			this.subscribed = false;
			this.subscribeIntent = false;
			this.subscriber = null;
			if (client.isOpen) client.destroy();
			const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
			this.options.logger.warn(`${this.options.name} subscription failed (attempt ${attempt + 1}), retrying in ${delay}ms: ${error}`);
			this.retryTimer = setTimeout(() => {
				this.retryTimer = null;
				void this.attemptConnect(attempt + 1);
			}, delay);
		}
	}

	public async stop(): Promise<void> {
		this.stopped = true;
		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}
		this.subscribeIntent = false;
		this.subscribed = false;
		if (!this.subscriber) return;
		const client = this.subscriber;
		this.subscriber = null;
		if (client.isReady) {
			if (this.options.pattern) {
				await client.pUnsubscribe(this.options.channel).catch(() => undefined);
			} else {
				await client.unsubscribe(this.options.channel).catch(() => undefined);
			}
			await client.quit().catch(() => undefined);
		} else if (client.isOpen) {
			// 연결 도중엔 quit(QUIT 왕복 대기)이 멈출 수 있어 소켓을 즉시 파괴해요
			client.destroy();
		}
	}
}
