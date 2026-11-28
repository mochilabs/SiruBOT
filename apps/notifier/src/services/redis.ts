import { createClient, type RedisClientType } from '@redis/client';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('redis');

const memory = new Map<string, { value: string; expiresAt: number }>();

export class NotifierRedis {
	private client: RedisClientType | null = null;

	public async connect(url: string | undefined): Promise<void> {
		if (!url) {
			logger.warn('REDIS_URL이 없어요. 메모리 폴백으로 동작해요 (단일 인스턴스만 지원).');
			return;
		}
		try {
			const client = createClient({ url });
			client.on('error', (error) => logger.error('redis 오류, 메모리 폴백으로 전환:', String(error)));
			this.client = client;
			logger.info('Redis 백그라운드 연결 중 (준비 전까지 메모리 폴백)');
			void client.connect().catch((error) => {
				logger.warn('Redis 연결 실패, 메모리 폴백 유지:', String(error));
				if (this.client === client) this.client = null;
			});
		} catch (error) {
			logger.warn('Redis 연결 실패, 메모리 폴백 유지:', String(error));
			this.client = null;
		}
	}

	public async disconnect(): Promise<void> {
		memory.clear();
		if (this.client) {
			const client = this.client;
			this.client = null;
			if (client.isReady) {
				await client.close().catch(() => null);
			} else if (client.isOpen) {
				client.destroy();
			}
		}
	}

	public getClient(): RedisClientType | null {
		return this.client?.isReady ? this.client : null;
	}

	public async get(key: string): Promise<string | null> {
		if (this.client?.isReady) {
			try {
				return await this.client.get(key);
			} catch {}
		}
		const entry = memory.get(key);
		if (!entry) return null;
		if (entry.expiresAt < Date.now()) {
			memory.delete(key);
			return null;
		}
		return entry.value;
	}

	public async set(key: string, value: string, ttlSeconds: number): Promise<void> {
		if (this.client?.isReady) {
			try {
				await this.client.set(key, value, { EX: ttlSeconds });
				return;
			} catch {}
		}
		memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
	}

	public async del(key: string): Promise<void> {
		if (this.client?.isReady) {
			try {
				await this.client.del(key);
				return;
			} catch {}
		}
		memory.delete(key);
	}

	public async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
		if (this.client?.isReady) {
			try {
				const count = await this.client.incr(key);
				if (count === 1) {
					await this.client.expire(key, ttlSeconds);
				}
				return count;
			} catch {}
		}
		const entry = memory.get(key);
		const now = Date.now();
		if (!entry || entry.expiresAt < now) {
			memory.set(key, { value: '1', expiresAt: now + ttlSeconds * 1000 });
			return 1;
		}
		const next = Number(entry.value) + 1;
		memory.set(key, { value: String(next), expiresAt: entry.expiresAt });
		return next;
	}

	public async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
		if (this.client?.isReady) {
			try {
				const result = await this.client.set(key, '1', { NX: true, EX: ttlSeconds });
				return result === 'OK';
			} catch {
				return true;
			}
		}
		return true;
	}
}
