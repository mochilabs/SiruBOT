import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Channel } from 'discord.js';
import * as guildChatPolicy from '../../../services/guildSettings/chatPolicy.ts';

@ApplyOptions<Listener.Options>({
	event: Events.ChannelDelete
})
export class ChannelDeleteListener extends Listener {
	public override async run(channel: Channel): Promise<void> {
		const guildId = 'guild' in channel && channel.guild ? channel.guild.id : null;
		if (!guildId) return;

		this.container.aiChatHistory.dropChannelHistory(channel.id);

		try {
			await guildChatPolicy.removeAiChannel(this.container.guildService, guildId, channel.id);
		} catch (error) {
			this.container.logger.error(`[channelDelete] failed to prune aiChannelIds for ${channel.id}:`, error);
		}
	}
}
