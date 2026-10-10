import { type RedisClientType } from '@redis/client';
import { ILogObj, Logger } from 'tslog';

/**
 * pendingWrites 저널을 Redis로 밀어 넣는다 (queueStore · playerSaver 공용).
 * 실패한 쓰기를 지우면 데이터가 영구 소실되므로 성공한 키만 제거한다.
 * 동기화 도중 최신 값으로 갱신된 키는 살려 두어 stale 값의 되살아난 덮어쓰기를 막는다.
 */
export async function syncPendingWrites(
	redis: RedisClientType,
	pendingWrites: Map<string, string>,
	ttlSeconds: number,
	logger: Logger<ILogObj>
): Promise<{ synced: number; failed: number }> {
	if (pendingWrites.size === 0) {
		logger.debug('No pending writes to sync');
		return { synced: 0, failed: 0 };
	}

	logger.info(`Syncing ${pendingWrites.size} pending writes...`);

	const entries = [...pendingWrites.entries()];
	let synced = 0;
	let failed = 0;
	for (const [key, value] of entries) {
		try {
			await redis.set(key, value, { EX: ttlSeconds });
			// 그 사이 같은 키에 더 최신 값이 들어왔다면 지우지 않는다.
			if (pendingWrites.get(key) === value) pendingWrites.delete(key);
			synced++;
		} catch (error) {
			failed++;
			logger.error(`Failed to sync ${key}: ${error}`);
		}
	}
	logger.info(`Pending writes sync done: ${synced} synced, ${failed} kept for retry`);
	return { synced, failed };
}
