import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message } from 'discord.js';

@ApplyOptions<Listener.Options>({
	event: Events.MessageUpdate
})
export class AiHistoryMessageUpdatedListener extends Listener {
	public override async run(oldMessage: Message, newMessage: Message): Promise<void> {
		if (newMessage.partial || !newMessage.author) return;
		if (newMessage.author.bot) return;
		if (!newMessage.channelId || !newMessage.id) return;
		if (oldMessage.content === newMessage.content) return;

		const client = this.container.client;
		let content = newMessage.content;
		if (client.user) {
			content = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
		}
		// 멘션만 지워 내용이 빈 경우에도 기존 기록을 유지해요 (삭제는 delete 리스너가 처리).
		if (!content) return;
		await this.container.aiChatHistory.updateChannelHistoryMessage(newMessage.channelId, newMessage.id, content);
	}
}
