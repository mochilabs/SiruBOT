import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Collection, Message, type BaseChannel } from 'discord.js';

@ApplyOptions<Listener.Options>({
	event: 'messageDeleteBulk'
})
export class AiHistoryMessageBulkDeletedListener extends Listener {
	public override async run(messages: Collection<string, Message>, channel?: BaseChannel): Promise<void> {
		if (messages.size === 0) return;
		const channelId = channel?.id ?? messages.first()?.channelId;
		if (!channelId) return;
		await this.container.aiChatHistory.removeFromChannelHistory(channelId, new Set(messages.keys()));
	}
}
