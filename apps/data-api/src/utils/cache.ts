import { createClient, type RedisClientType } from "@redis/client";
import { getLogger } from "./logger.ts";

const logger = getLogger("cache");

const memory = new Map<string, { value: string; expiresAt: number }>();

/** Redis 공유 캐시. Redis 없으면 프로세스 메모리 폴백 (단일 레플리카 가정). */
export class SharedCache {
  private client: RedisClientType | null = null;
  private memoryHits = 0;
  private redisHits = 0;
  private misses = 0;

  public async connect(url: string | undefined): Promise<void> {
    if (!url) {
      logger.warn(
        "REDIS_URL is not set, using in-memory cache (single replica only)",
      );
      return;
    }
    try {
      this.client = createClient({ url });
      this.client.on("error", (error) =>
        logger.error("redis error, falling back to memory:", String(error)),
      );
      await this.client.connect();
      logger.info("Connected to Redis");
    } catch (error) {
      logger.warn(
        "Redis connect failed, using in-memory cache:",
        String(error),
      );
      this.client = null;
    }
  }

  public async disconnect(): Promise<void> {
    memory.clear();
    if (this.client) {
      await this.client.close().catch(() => null);
      this.client = null;
    }
  }

  public get connected(): boolean {
    return this.client?.isOpen === true;
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

  public async set(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    if (this.client?.isOpen) {
      try {
        await this.client.set(key, value, { EX: ttlSeconds });
        return;
      } catch {
        // 폴백
      }
    }
    memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  /** 분산 락 (번역 단일화용). Redis 없으면 항상 획득 성공. */
  public async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    if (this.client?.isOpen) {
      try {
        const result = await this.client.set(key, "1", {
          NX: true,
          EX: ttlSeconds,
        });
        return result === "OK";
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
      misses: this.misses,
    };
  }
}

export const sharedCache = new SharedCache();
