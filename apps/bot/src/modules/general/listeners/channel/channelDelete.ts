import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Channel } from 'discord.js';
import { dropChannelHistory } from '../../../../services/aiChatService.ts';
import * as guildChatPolicy from '../../../../services/guildSettings/chatPolicy.ts';

/** 채널 삭제 시 AI 채팅 기록과 허용 채널 목록의 항목을 함께 정리해요 */
@ApplyOptions<Listener.Options>({
	event: Events.ChannelDelete
})
export class ChannelDeleteListener extends Listener {
	public override async run(channel: Channel): Promise<void> {
		const guildId = 'guild' in channel && channel.guild ? channel.guild.id : null;
		if (!guildId) return;

		dropChannelHistory(channel.id);

		try {
			await guildChatPolicy.removeAiChannel(this.container.guildService, guildId, channel.id);
		} catch (error) {
			this.container.logger.error(`[channelDelete] failed to prune aiChannelIds for ${channel.id}:`, error);
		}
	}
}
