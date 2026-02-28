import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { CloseEvent } from 'discord.js';

@ApplyOptions<Listener.Options>({
	event: 'shardDisconnect'
})
export class ShardDisconnectEvent extends Listener {
	public override run(event: CloseEvent, id: number) {
		this.container.logger.warn(`Shard ${id} disconnected. Code: ${event.code}, Reason: ${event.reason}`);
	}
}
