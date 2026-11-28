import { container } from '@sapphire/framework';
import { sleep } from '@sirubot/utils/time';
import type { Config } from '../lib/config.ts';

export interface ShardIdentity {
	shardIds: number[] | 'auto';
	shardCount: number;
}

export const resolveShardIdentity = async (isDevMode: boolean, shardConfig: Config['shard']): Promise<ShardIdentity> => {
	let shardIds: number[] | 'auto' = isDevMode ? [0] : 'auto';
	let shardCount: number = 1;

	if (!isDevMode) {
		const shardManagerUrl = shardConfig.managerUrl;
		if (!shardManagerUrl) {
			console.error('SHARD_MANAGER_URL is required in production mode. Exiting...');
			process.exit(1);
		}

		// fail-closed: 샤드매니저 인증 키 미설정 시 즉시 종료해요.
		const authKey = shardConfig.authKey;
		if (!authKey) {
			console.error('AUTH_KEY is required when SHARD_MANAGER_URL is set. Exiting...');
			process.exit(1);
		}

		const { ShardClient, NoShardsAvailableError } = await import('@sirubot/shardclient');
		const shardClient = new ShardClient({
			serverURL: shardManagerUrl,
			authKey,
			logger: console
		});

		const identifyRetryMs = shardConfig.identifyRetryMs;
		// 롤링 업데이트 중 일시적으로 샤드 슬롯이 없을 수 있어 재시도해요.
		while (true) {
			try {
				const identity = await shardClient.identify();
				shardIds = identity.shardIds;
				shardCount = identity.shardCount;
				break;
			} catch (error) {
				if (error instanceof NoShardsAvailableError) {
					console.warn(`No shards available from shard manager. Retrying in ${identifyRetryMs}ms...`);
					await sleep(identifyRetryMs);
					continue;
				}
				throw error;
			}
		}

		container.shardClient = shardClient;
	}

	return { shardIds, shardCount };
};
