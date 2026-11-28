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
	name: string;
	url: string;
	logger: RedisSubscriberLogger;
	bindings: RedisSubscriberBinding[];
	reconnectDelayMs?: number;
	reconnectMaxDelayMs?: number;
}

// Dedicated subscriber connection; call stop() before disconnecting the main Redis store.
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

	public get isSubscribed(): boolean {
		return this.subscriber !== null;
	}

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
			// node-redis does not auto-reconnect after 'end'.
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
			if (client && client !== this.subscriber && client.isOpen) {
				client.destroy();
			}
			await this.scheduleReconnect();
		} finally {
			if (previous && previous !== this.subscriber) {
				await previous.quit().catch(() => undefined);
			}
		}
	}

	private scheduleReconnect(): void {
		if (this.stopped || this.reconnectTimer) return;
		const delay = Math.min(this.baseDelay * 2 ** this.attempts, this.maxDelay);
		this.attempts++;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			void this.connectOnce();
		}, delay);
	}

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
