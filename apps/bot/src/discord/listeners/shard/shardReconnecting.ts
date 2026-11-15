import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({
	event: 'shardReconnecting'
})
export class ShardReconnectingEvent extends Listener {
	public override run(id: number) {
		this.container.logger.info(`Shard ${id} reconnecting...`);
	}
}
