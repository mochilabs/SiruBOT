import { createClient, type RedisClientType } from '@redis/client';
import type { Logger, ILogObj } from 'tslog';
import { sharedCache } from './cache.ts';

const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 5_000;

export interface HubSubscriberOptions {
	name: string;
	channel: string;
	pattern?: boolean;
	onMessage: (message: string, channel: string) => void;
	logger: Logger<ILogObj>;
}

export class HubSubscriber {
	private readonly options: HubSubscriberOptions;
	private subscriber: RedisClientType | null = null;
	private subscribeIntent = false;
	private subscribed = false;
	private stopped = false;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private redisUrl = '';

	public constructor(options: HubSubscriberOptions) {
		this.options = options;
	}

	public get isSubscribed(): boolean {
		return this.subscribed;
	}

	public async start(redisUrl: string): Promise<void> {
		this.stopped = false;
		this.redisUrl = redisUrl;
		void this.attemptConnect(0);
	}

	private async attemptConnect(attempt: number): Promise<void> {
		if (this.stopped) return;
		const base = sharedCache.getClient();
		const client = (base ? base.duplicate() : createClient({ url: this.redisUrl })) as RedisClientType;
		this.subscriber = client;
		client.on('error', (error) => {
			this.subscribed = false;
			this.options.logger.error(`${this.options.name} subscriber error: ${error}`);
		});
		client.on('reconnecting', () => (this.subscribed = false));
		client.on('end', () => (this.subscribed = false));
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
			// Destroy socket immediately when not ready; quit() can hang mid-connect.
			client.destroy();
		}
	}
}
