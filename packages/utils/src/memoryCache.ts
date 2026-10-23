export type MemoryCacheEntry<T> = {
	data: T;
	expiresAt: number;
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
		// JS Map은 insertion-ordered — 첫 엔트리가 가장 오래 전에 삽입된 항목이라 O(1)로 제거 가능.
		if (!this.cache.has(key) && this.cache.size >= this.memoryCacheOptions.maxSize) {
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey !== undefined) {
				this.cache.delete(oldestKey);
			}
		}

		this.cache.set(key, {
			data: value,
			expiresAt: Date.now() + this.memoryCacheOptions.ttl
		});
	}

	public get(key: Key): Value | undefined {
		const entry = this.cache.get(key);
		if (!entry) return undefined;

		if (entry.expiresAt < Date.now()) {
			this.cache.delete(key);
			return undefined;
		}

		// 재삽입으로 최근 사용 항목을 맨 뒤로 승격 — O(1) LRU 갱신.
		this.cache.delete(key);
		this.cache.set(key, entry);
		return entry.data;
	}

	public delete(key: Key) {
		this.cache.delete(key);
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
			ttl: this.memoryCacheOptions.ttl
		};
	}
}
