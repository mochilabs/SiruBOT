import { createClient, type RedisClientType } from '@redis/client';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('redis');

const memory = new Map<string, { value: string; expiresAt: number }>();

/** notifier 전용 Redis 래퍼. Redis 없으면 프로세스 메모리 폴백 (단일 레플리카 가정). */
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
			// 최초 연결은 백그라운드로 돌아가요. Redis가 notifier보다 늦게 떠도 부팅을 막지 않아요.
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
				// 연결 도중엔 close()가 멈출 수 있어 소켓을 즉시 파괴해요 (data-api와 같은 논리)
				client.destroy();
			}
		}
	}

	public get connected(): boolean {
		return this.client?.isReady === true;
	}

	/** Pub/Sub 등 전용 연결이 필요한 소비자를 위한 클라이언트 접근자 (duplicate해서 쓸 것) */
	public getClient(): RedisClientType | null {
		return this.client?.isReady ? this.client : null;
	}

	public async get(key: string): Promise<string | null> {
		// isReady 기준 가드: 연결 도중(isOpen만 true)에 명령을 내면 오프라인 큐에서 영원히 대기하므로, 준비 전엔 메모리 폴백으로 처리해요.
		if (this.client?.isReady) {
			try {
				return await this.client.get(key);
			} catch {
				// Redis 장애 → 메모리 폴백
			}
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
			} catch {
				// 폴백
			}
		}
		memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
	}

	public async del(key: string): Promise<void> {
		if (this.client?.isReady) {
			try {
				await this.client.del(key);
				return;
			} catch {
				// 폴백
			}
		}
		memory.delete(key);
	}

	/** INCR 후 첫 카운트(결과 1)일 때만 TTL을 걸어요. 반환값은 현재 카운트. */
	public async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
		if (this.client?.isReady) {
			try {
				const count = await this.client.incr(key);
				if (count === 1) {
					await this.client.expire(key, ttlSeconds);
				}
				return count;
			} catch {
				// 폴백
			}
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

	/** 분산 락 (폴러 다중 인스턴스 방지). Redis 없으면 항상 획득 성공: 단일 인스턴스 가정. */
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
