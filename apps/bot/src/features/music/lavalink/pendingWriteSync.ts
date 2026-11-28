import { type RedisClientType } from '@redis/client';
import { ILogObj, Logger } from 'tslog';

export async function syncPendingWrites(
	redis: RedisClientType,
	pendingWrites: Map<string, string | null>,
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
			if (value === null) {
				await redis.del(key);
			} else {
				await redis.set(key, value, { EX: ttlSeconds });
			}
			// Keep newer pending writes that arrived while this sync was in flight.
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
