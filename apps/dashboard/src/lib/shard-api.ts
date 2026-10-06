export interface ShardProcessInfo {
	wsId: string;
	shardIds: number[];
	status: string;
	guilds: number;
	players: number;
	memoryUsage: number;
	uptime: number;
	lastHeartbeat: number;
	connectedAt: number;
}

export interface ShardAggregateStats {
	shardCount: number;
	shardsPerProcess: number;
	processCount: number;
	allocatedShards: number;
	totalGuilds: number;
	totalPlayers: number;
	totalMemoryMB: number;
}

export interface ShardsResponse {
	processes: ShardProcessInfo[];
	stats: ShardAggregateStats;
}

const SHARD_MANAGER_URL = process.env.SHARD_MANAGER_URL || 'http://localhost:3001';

/** SHARD_MANAGER_AUTH_KEY가 없으면 에러 — 기본 키 폴백을 두지 않는다 */
function getShardManagerAuthKey(): string {
	const key = process.env.SHARD_MANAGER_AUTH_KEY;
	if (!key) {
		throw new Error('[shard-api] SHARD_MANAGER_AUTH_KEY 환경변수가 설정되지 않았습니다.');
	}
	return key;
}

export async function fetchShards(): Promise<ShardsResponse | null> {
	let authKey: string;
	try {
		authKey = getShardManagerAuthKey();
	} catch (error) {
		console.error(error);
		return null;
	}
	try {
		const res = await fetch(`${SHARD_MANAGER_URL}/api/shards`, {
			cache: 'no-store',
			headers: {
				Authorization: authKey,
			},
		});
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}
