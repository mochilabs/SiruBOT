import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({
	event: 'shardError'
})
export class ShardErrorEvent extends Listener {
	public override run(error: Error, id: number) {
		this.container.logger.error('shard.lifecycle.error', { shard_id: id, error });
	}
}
