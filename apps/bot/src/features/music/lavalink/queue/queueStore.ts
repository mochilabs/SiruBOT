import { type RedisClientType } from '@redis/client';
import { Awaitable, LavalinkManager, QueueStoreManager, StoredQueue } from 'lavalink-client';
import { PendingWriteStore } from '../pendingWriteStore.ts';
import type { LavalinkLogger } from '../deps.ts';
import type { CustomPlayer } from '../player/customPlayer.ts';

export interface CachedQueueStoreDeps {
	logger: LavalinkLogger;
	getAudio: () => LavalinkManager<CustomPlayer> | undefined;
}

export const QUEUE_WRITE_COALESCE_MS = 400;

export class CachedQueueStore extends PendingWriteStore implements QueueStoreManager {
	constructor(
		redis: RedisClientType,
		private readonly queueDeps: CachedQueueStoreDeps
	) {
		super(
			redis,
			'queueStore',
			{
				ttl: 30 * 60 * 1000,
				maxSize: 1000
			},
			QUEUE_WRITE_COALESCE_MS,
			queueDeps.logger
		);
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
		const player = this.queueDeps.getAudio()?.getPlayer?.(guildId) as { currentEpoch?: number } | undefined;
		const enriched =
			typeof value === 'object' && value !== null && typeof player?.currentEpoch === 'number'
				? ({ ...value, epoch: player.currentEpoch } as StoredQueue & { epoch: number })
				: value;
		const stringValue = this.stringify(enriched) as string;
		await this.writeRaw(guildId, stringValue);
	}

	public async delete(guildId: string): Promise<void | boolean> {
		this.logger.trace(`Deleting queue for guild ${guildId}`);
		return this.deleteRaw(guildId);
	}

	public parse(value: StoredQueue | string): Partial<StoredQueue> {
		this.logger.trace(`Parsing queue`);
		if (typeof value !== 'string') return value;
		try {
			return JSON.parse(value);
		} catch (error) {
			this.logger.warn(`Corrupted stored queue ignored, falling back to an empty queue: ${error}`);
			return { current: null, previous: [], tracks: [] };
		}
	}

	public stringify(value: StoredQueue | string): Awaitable<StoredQueue | string> {
		this.logger.trace(`Stringifying queue`);
		return typeof value === 'string' ? value : JSON.stringify(value);
	}
}
