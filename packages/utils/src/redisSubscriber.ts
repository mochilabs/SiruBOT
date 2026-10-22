import { createClient, type RedisClientType } from '@redis/client';

export interface RedisSubscriberLogger {
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
	debug(msg: string): void;
}

export interface RedisSubscriberBinding {
	channel: string;
	onMessage: (raw: string) => void;
}

export interface ManagedRedisSubscriberOptions {
	/** 로그 접두사 — 예: '설정 무효화' */
	name: string;
	url: string;
	logger: RedisSubscriberLogger;
	bindings: RedisSubscriberBinding[];
	/** 재연결 백오프 시작/상한(ms) */
	reconnectDelayMs?: number;
	reconnectMaxDelayMs?: number;
}

/**
 * 전용 연결 Pub/Sub 구독 관리자 — 봇 서비스 3형제(설정 무효화/봇 프로필/멤버 인사)의
 * 공용 구성요소. 구독 전용 연결은 일반 명령을 쓸 수 없어 RedisStore 연결을 재사용하지 못해요.
 * start/재연결 실패는 절대 throw하지 않아요 — 자체 백오프(기본 5s→60s)로 계속 시도해요.
 * stop()은 shutdown에서 redisStore.disconnect() 전에 불러야 해요.
 */
export class ManagedRedisSubscriber {
	private subscriber: RedisClientType | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private attempts = 0;
	private stopped = false;
	private readonly baseDelay: number;
	private readonly maxDelay: number;

	public constructor(private readonly options: ManagedRedisSubscriberOptions) {
		this.baseDelay = options.reconnectDelayMs ?? 5_000;
		this.maxDelay = options.reconnectMaxDelayMs ?? 60_000;
	}

	/** 연결+전체 채널 구독 성공 후 연결 종료('end') 전까지 true예요 — 요청 시점 가용성 판단용 (소켓이 아니라 구독 완료 기준) */
	public get isSubscribed(): boolean {
		return this.subscriber !== null;
	}

	/** 시작 — 실패해도 throw하지 않아요 */
	public async start(): Promise<void> {
		this.stopped = false;
		await this.connectOnce();
	}

	private async connectOnce(): Promise<void> {
		if (this.stopped) return;
		const previous = this.subscriber;
		let client: RedisClientType | null = null;
		try {
			client = createClient({ url: this.options.url }) as RedisClientType;
			const connecting = client;
			connecting.on('error', (error) => this.options.logger.warn(`${this.options.name} 구독 오류: ${error.message}`));
			// 끊김 → 재연결. node-redis도 자체 재연결을 하지만 end 이후에는 살아나지 않으므로 안전망을 둔다.
			connecting.on('end', () => {
				if (this.subscriber === connecting) {
					this.subscriber = null;
					void this.scheduleReconnect();
				}
			});

			await connecting.connect();
			for (const binding of this.options.bindings) {
				await connecting.subscribe(binding.channel, (raw) => binding.onMessage(raw));
			}

			// stop()이 connect 완료 전에 불렸으면 등록하지 않고 즉시 닫는다 — shutdown 후 잔류 구독 연결 방지.
			if (this.stopped) {
				await connecting.quit().catch(() => undefined);
				return;
			}
			this.subscriber = connecting;
			this.attempts = 0;
			this.options.logger.info(`${this.options.name} 구독 시작: ${this.options.bindings.map((b) => b.channel).join(', ')}`);
		} catch (error) {
			this.subscriber = this.subscriber === previous ? null : this.subscriber;
			this.options.logger.warn(`${this.options.name} 구독 실패, 재연결 예약: ${error instanceof Error ? error.message : String(error)}`);
			// connect 성공 후 subscribe 실패 같은 경로에서 새 클라이언트 소켓이 열린 채 남지 않게 즉시 닫는다.
			if (client && client !== this.subscriber && client.isOpen) {
				client.destroy();
			}
			await this.scheduleReconnect();
		} finally {
			// 실패/교체로 버려진 이전 연결을 닫는다 — 소켓 누수 방지.
			if (previous && previous !== this.subscriber) {
				await previous.quit().catch(() => undefined);
			}
		}
	}

	/** 재연결 백오프 — 지수 증가(기본 5s 시작·60s 상한) */
	private scheduleReconnect(): void {
		if (this.stopped || this.reconnectTimer) return;
		const delay = Math.min(this.baseDelay * 2 ** this.attempts, this.maxDelay);
		this.attempts++;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			void this.connectOnce();
		}, delay);
	}

	/** 종료 — 구독 해제 후 연결을 닫아요 */
	public async stop(): Promise<void> {
		this.stopped = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		const client = this.subscriber;
		this.subscriber = null;
		if (!client) return;
		for (const binding of this.options.bindings) {
			await client.unsubscribe(binding.channel).catch(() => undefined);
		}
		await client.quit().catch(() => undefined);
	}
}
