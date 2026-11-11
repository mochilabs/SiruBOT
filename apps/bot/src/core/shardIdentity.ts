import { container } from '@sapphire/framework';
import { sleep } from '@sirubot/utils/time';
import type { Config } from '../lib/config.ts';

export interface ShardIdentity {
	shardIds: number[] | 'auto';
	shardCount: number;
}

/** 샤드 ID/개수를 결정해요. 개발 모드는 단독 샤드 [0], 프로덕션은 샤드매니저에서 받아와요 (container.shardClient 저장). */
export const resolveShardIdentity = async (isDevMode: boolean, shardConfig: Config['shard']): Promise<ShardIdentity> => {
	let shardIds: number[] | 'auto' = isDevMode ? [0] : 'auto';
	let shardCount: number = 1;

	if (!isDevMode) {
		// Production: Get shard ID assigned from manager via ShardClient
		const shardManagerUrl = shardConfig.managerUrl;
		if (!shardManagerUrl) {
			console.error('SHARD_MANAGER_URL is required in production mode. Exiting...');
			process.exit(1);
		}

		// 샤드매니저 연결에는 인증 키가 필요하다 — 미설정 시 빈 키로 통과(fail-open)하지 않고 즉시 종료(data-api/storage와 동일한 fail-closed 정책).
		// 개발 모드(단독 실행, 샤드매니저 미사용)에서는 이 블록 자체를 건너뛰므로 AUTH_KEY 없이도 계속 기동한다.
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
		// During rolling updates, shard slots can be temporarily unavailable.
		// Keep retrying instead of exiting so the new process can pick up shards once old process releases.
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

		// Store shardClient in container (for stats reporting)
		container.shardClient = shardClient;
	}

	return { shardIds, shardCount };
};
