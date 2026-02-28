import { ShardClientError } from './ShardClientError.ts';

export class NoShardsAvailableError extends ShardClientError {
	constructor() {
		super('No shards available from shard manager');
		this.name = 'NoShardsAvailableError';
	}
}
