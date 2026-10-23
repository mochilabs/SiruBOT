export class NoShardsAvailableError extends Error {
	constructor() {
		super('No shards available from shard manager');
		this.name = 'NoShardsAvailableError';
	}
}
