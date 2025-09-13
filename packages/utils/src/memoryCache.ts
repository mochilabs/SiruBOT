export type MemoryCacheEntry<T> = {
  data: T;
  expiresAt: number;
  lastUpdated: number;
};

export type MemoryCacheOptions = {
  ttl: number;
  maxSize: number;
};

export class MemoryCache<Key, Value> {
  private cache: Map<Key, MemoryCacheEntry<Value>> = new Map();
  private memoryCacheOptions: MemoryCacheOptions;

  public constructor(memoryCacheOptions: MemoryCacheOptions) {
    this.memoryCacheOptions = memoryCacheOptions;
  }

  public set(key: Key, value: Value) {
    if (this.cache.size >= this.memoryCacheOptions.maxSize) {
      this.evictOldest();
    }

    const entry: MemoryCacheEntry<Value> = {
      data: value,
      expiresAt: Date.now() + this.memoryCacheOptions.ttl,
      lastUpdated: Date.now(),
    };
    this.cache.set(key, entry);
  }

  public get(key: Key): Value | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }

    entry.lastUpdated = Date.now();
    return entry.data;
  }

  public delete(key: Key) {
    this.cache.delete(key);
  }

  public clear() {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }

  public has(key: Key): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  private evictOldest(): void {
    let oldestKey: Key | undefined;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      // 만료된 항목이 있으면 우선 제거
      if (entry.expiresAt < Date.now()) {
        this.cache.delete(key);
        return;
      }

      // 가장 오래 접근하지 않은 항목 찾기
      if (entry.lastUpdated < oldestTime) {
        oldestTime = entry.lastUpdated;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this.cache.delete(oldestKey);
    }
  }

  public cleanup(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    return removedCount;
  }

  public getStats() {
    const now = Date.now();
    let expiredCount = 0;

    for (const [, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        expiredCount++;
      }
    }

    return {
      totalSize: this.cache.size,
      expiredCount,
      maxSize: this.memoryCacheOptions.maxSize,
      ttl: this.memoryCacheOptions.ttl,
    };
  }
}
