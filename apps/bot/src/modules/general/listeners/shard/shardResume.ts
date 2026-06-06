import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({
	event: 'shardResume'
})
export class ShardResumeEvent extends Listener {
	public override run(id: number, replayedEvents: number) {
		this.container.logger.info('shard.lifecycle.resumed', { shard_id: id, replayed_events: replayedEvents });
	}
}
