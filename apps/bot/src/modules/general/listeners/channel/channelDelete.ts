import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Channel } from 'discord.js';
import { dropChannelHistory } from '../../../../services/aiChatService.ts';

/** 채널 삭제 시 AI 채팅 기록과 aiDisabledChannelIds 항목을 함께 정리해요 */
@ApplyOptions<Listener.Options>({
	event: Events.ChannelDelete
})
export class ChannelDeleteListener extends Listener {
	public override async run(channel: Channel): Promise<void> {
		const guildId = 'guild' in channel && channel.guild ? channel.guild.id : null;
		if (!guildId) return;

		dropChannelHistory(channel.id);

		try {
			const settings = await this.container.guildService.getAiSettings(guildId);
			if (settings.disabledChannelIds.includes(channel.id)) {
				await this.container.guildService.setChannelAiEnabled(guildId, channel.id, true);
			}
		} catch (error) {
			this.container.logger.error(`[channelDelete] failed to prune aiDisabledChannelIds for ${channel.id}:`, error);
		}
	}
}
