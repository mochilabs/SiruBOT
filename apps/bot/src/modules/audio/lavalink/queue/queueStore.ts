import { type RedisClientType } from '@redis/client';
import { Awaitable, QueueStoreManager, StoredQueue } from 'lavalink-client';
import { PendingWriteStore } from '../pendingWriteStore.ts';

export class CachedQueueStore extends PendingWriteStore implements QueueStoreManager {
	constructor(redis: RedisClientType) {
		super(redis, 'queueStore', {
			ttl: 30 * 60 * 1000,
			maxSize: 1000
		});
	}

	protected getKey(guildId: string): string {
		return `lavalink/queue/${guildId}`;
	}

	public async get(guildId: string): Promise<string> {
		const raw = await this.getRaw(guildId);
		if (raw !== null) return raw;

		const defaultQueue = JSON.stringify({
			current: null,
			previous: [],
			tracks: []
		});

		this.logger.trace(`No data found, returning default for guild ${guildId}`);
		return defaultQueue;
	}

	public async set(guildId: string, value: StoredQueue | string): Promise<void | boolean> {
		this.logger.trace(`Setting queue for guild ${guildId}`);
		const stringValue = this.stringify(value) as string;
		await this.writeRaw(guildId, stringValue);
	}

	public async delete(guildId: string): Promise<void | boolean> {
		this.logger.trace(`Deleting queue for guild ${guildId}`);
		return this.deleteRaw(guildId);
	}

	public parse(value: StoredQueue | string): Partial<StoredQueue> {
		this.logger.trace(`Parsing queue`);
		return typeof value === 'string' ? JSON.parse(value) : value;
	}

	public stringify(value: StoredQueue | string): Awaitable<StoredQueue | string> {
		this.logger.trace(`Stringifying queue`);
		return typeof value === 'string' ? value : JSON.stringify(value);
	}
}
