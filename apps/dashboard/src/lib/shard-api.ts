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
const SHARD_MANAGER_AUTH_KEY = process.env.SHARD_MANAGER_AUTH_KEY || 'youshallnotpass';

export async function fetchShards(): Promise<ShardsResponse | null> {
	try {
		const res = await fetch(`${SHARD_MANAGER_URL}/api/shards`, {
			cache: 'no-store',
			headers: {
				Authorization: SHARD_MANAGER_AUTH_KEY,
			},
		});
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}
