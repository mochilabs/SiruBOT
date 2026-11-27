import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message } from 'discord.js';

@ApplyOptions<Listener.Options>({
	event: Events.MessageDelete
})
export class AiHistoryMessageDeletedListener extends Listener {
	public override async run(message: Message): Promise<void> {
		if (!message.channelId || !message.id) return;
		await this.container.aiChatHistory.removeFromChannelHistory(message.channelId, new Set([message.id]));
	}
}
