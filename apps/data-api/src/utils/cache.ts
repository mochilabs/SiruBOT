import { createClient, type RedisClientType } from '@redis/client';
import { getLogger } from './logger.ts';

const logger = getLogger('cache');

const MAX_KEYS = 50_000;
const CARDINALITY_RESET_MS = 60 * 60 * 1000;

const memory = new Map<string, { value: string; expiresAt: number }>();

export class SharedCache {
	private client: RedisClientType | null = null;
	private memoryHits = 0;
	private redisHits = 0;
	private misses = 0;
	private keyCardinality = new Set<string>();
	private cardinalityTimer: ReturnType<typeof setInterval> | null = null;

	public async connect(url: string | undefined): Promise<void> {
		if (!url) {
			logger.warn('REDIS_URL is not set, using in-memory cache (single replica only)');
			return;
		}
		try {
			const client = createClient({ url });
			client.on('error', (error) => logger.error('redis error, falling back to memory:', String(error)));
			client.once('ready', () => {
				// Ignore late ready event if disconnect() already replaced this client.
				if (this.client !== client) return;
				this.startCardinalityTimer();
				logger.info('Connected to Redis');
			});
			this.client = client;
			// Connect in background so slow Redis does not block startup.
			logger.info('Connecting to Redis in background (memory fallback until ready)');
			void client.connect().catch((error) => {
				logger.warn('Redis connect failed, using in-memory cache:', String(error));
				if (this.client === client) this.client = null;
			});
		} catch (error) {
			logger.warn('Redis connect failed, using in-memory cache:', String(error));
			this.client = null;
		}
	}

	public async disconnect(): Promise<void> {
		memory.clear();
		this.stopCardinalityTimer();
		if (this.client) {
			const client = this.client;
			this.client = null;
			if (client.isReady) {
				await client.close().catch(() => null);
			} else if (client.isOpen) {
				// Destroy socket immediately when not ready; close() can hang mid-connect.
				client.destroy();
			}
		}
	}

	private startCardinalityTimer(): void {
		if (this.cardinalityTimer) return;
		this.cardinalityTimer = setInterval(() => {
			this.keyCardinality.clear();
		}, CARDINALITY_RESET_MS);
	}

	private stopCardinalityTimer(): void {
		if (this.cardinalityTimer) {
			clearInterval(this.cardinalityTimer);
			this.cardinalityTimer = null;
		}
	}

	private admissionGate(key: string): boolean {
		const isNew = !this.keyCardinality.has(key);
		if (isNew && this.keyCardinality.size >= MAX_KEYS) {
			logger.warn('Cache key cardinality limit reached: refusing new cache keys');
			return false;
		}
		this.keyCardinality.add(key);
		return true;
	}

	public get connected(): boolean {
		return this.client?.isReady === true;
	}

	public getClient(): RedisClientType | null {
		return this.client?.isReady ? this.client : null;
	}

	public async get(key: string): Promise<string | null> {
		// Require isReady; commands issued while only isOpen queue indefinitely.
		if (this.client?.isReady) {
			try {
				const value = await this.client.get(key);
				if (value != null) this.redisHits++;
				else this.misses++;
				return value;
			} catch {}
		}
		const entry = memory.get(key);
		if (!entry) {
			this.misses++;
			return null;
		}
		if (entry.expiresAt < Date.now()) {
			memory.delete(key);
			this.misses++;
			return null;
		}
		this.memoryHits++;
		return entry.value;
	}

	public async set(key: string, value: string, ttlSeconds: number): Promise<void> {
		if (!this.admissionGate(key)) return;
		if (this.client?.isReady) {
			try {
				await this.client.set(key, value, { EX: ttlSeconds });
				return;
			} catch {}
		}
		if (memory.size >= MAX_KEYS) {
			const now = Date.now();
			for (const [k, entry] of memory) {
				if (entry.expiresAt < now) memory.delete(k);
				if (memory.size < MAX_KEYS) break;
			}
			if (memory.size >= MAX_KEYS) {
				const oldest = memory.keys().next().value;
				if (oldest !== undefined) memory.delete(oldest);
			}
		}
		memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
	}

	public async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
		if (this.client?.isReady) {
			try {
				const result = await this.client.set(key, '1', {
					NX: true,
					EX: ttlSeconds
				});
				return result === 'OK';
			} catch {
				return true;
			}
		}
		return true;
	}

	public stats(): {
		redis: boolean;
		redisHits: number;
		memoryHits: number;
		misses: number;
	} {
		return {
			redis: this.connected,
			redisHits: this.redisHits,
			memoryHits: this.memoryHits,
			misses: this.misses
		};
	}
}

export const sharedCache = new SharedCache();
