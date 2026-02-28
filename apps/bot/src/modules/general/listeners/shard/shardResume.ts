import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({
	event: 'shardResume'
})
export class ShardResumeEvent extends Listener {
	public override run(id: number, replayedEvents: number) {
		this.container.logger.info(`Shard ${id} resumed. Replayed ${replayedEvents} events.`);
	}
}
