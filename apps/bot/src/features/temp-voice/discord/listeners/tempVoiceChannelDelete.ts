import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Channel } from 'discord.js';

@ApplyOptions<Listener.Options>({
	event: Events.ChannelDelete
})
export class TempVoiceChannelDeleteListener extends Listener {
	public override run(channel: Channel): void {
		if (!('guild' in channel) || !channel.guild) return;
		this.container.tempVoiceService.handleChannelDelete(channel.id);
	}
}
