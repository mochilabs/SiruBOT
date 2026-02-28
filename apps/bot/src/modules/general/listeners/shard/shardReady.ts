import { Listener } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';

@ApplyOptions<Listener.Options>({ once: true, event: 'shardReady' })
export class ShardReadyEvent extends Listener {
	public override run(id: number, _unavailableGuilds?: Set<string>) {
		this.container.logger.info(`Shard ${id} ready!`);
	}
}
