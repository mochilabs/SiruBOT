import { createClient, type RedisClientType } from '@redis/client';
import { getLogger } from './logger.ts';

const logger = getLogger('cache');

// Redis 키 플러딩 상한: 유니크 키 카디널리티가 임계값을 넘으면 새 키 쓰기를 거부해요 (캐시 미스로 동작, 서비스는 계속).
const MAX_KEYS = 50_000;
// 카디널리티 Set은 만료 추적이 안 되므로 주기적으로 비워 재수렴시켜요.
const CARDINALITY_RESET_MS = 60 * 60 * 1000;

const memory = new Map<string, { value: string; expiresAt: number }>();

/** Redis 공유 캐시. Redis 없으면 프로세스 메모리 폴백 (단일 레플리카 가정). */
export class SharedCache {
	private client: RedisClientType | null = null;
	private memoryHits = 0;
	private redisHits = 0;
	private misses = 0;
	// 프로세스가 본 유니크 캐시 키 집계 (set 시점에만 추가)
	private keyCardinality = new Set<string>();
	private cardinalityTimer: ReturnType<typeof setInterval> | null = null;

	public async connect(url: string | undefined): Promise<void> {
		if (!url) {
			logger.warn('REDIS_URL is not set, using in-memory cache (single replica only)');
			return;
		}
		try {
			this.client = createClient({ url });
			this.client.on('error', (error) => logger.error('redis error, falling back to memory:', String(error)));
			await this.client.connect();
			this.startCardinalityTimer();
			logger.info('Connected to Redis');
		} catch (error) {
			logger.warn('Redis connect failed, using in-memory cache:', String(error));
			this.client = null;
		}
	}

	public async disconnect(): Promise<void> {
		memory.clear();
		this.stopCardinalityTimer();
		if (this.client) {
			await this.client.close().catch(() => null);
			this.client = null;
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

	/** set 전에 카디널리티 게이트 — 상한 초과 시 새 키 쓰기 거부(캐시 미스로 동작) */
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
		return this.client?.isOpen === true;
	}

	/** Pub/Sub 등 전용 연결이 필요한 소비자를 위한 클라이언트 접근자 (duplicate해서 쓸 것) */
	public getClient(): RedisClientType | null {
		return this.client?.isOpen ? this.client : null;
	}

	public async get(key: string): Promise<string | null> {
		if (this.client?.isOpen) {
			try {
				const value = await this.client.get(key);
				if (value != null) this.redisHits++;
				else this.misses++;
				return value;
			} catch {
				// Redis 장애 → 메모리 폴백
			}
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
		if (this.client?.isOpen) {
			try {
				await this.client.set(key, value, { EX: ttlSeconds });
				return;
			} catch {
				// 폴백
			}
		}
		// 메모리 폴백 상한: 먼저 만료된 엔트리를 정리하고, 그래도 넘치면 가장 오래된 것(삽입 순서 첫 항목)을 삭제해요.
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

	/** 분산 락 (번역 단일화용). Redis 없으면 항상 획득 성공. */
	public async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
		if (this.client?.isOpen) {
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
