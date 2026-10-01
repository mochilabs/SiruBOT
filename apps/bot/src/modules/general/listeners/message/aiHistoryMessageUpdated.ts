import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message } from 'discord.js';
import { updateChannelHistoryMessage } from '../../../../services/aiChatService.ts';

/** 편집된 사용자 메시지를 AI 채널 기록에 반영해요 (봇 답변의 자기 편집은 제외) */
@ApplyOptions<Listener.Options>({
	event: Events.MessageUpdate
})
export class AiHistoryMessageUpdatedListener extends Listener {
	public override async run(oldMessage: Message, newMessage: Message): Promise<void> {
		if (newMessage.author.bot) return;
		if (!newMessage.channelId || !newMessage.id) return;
		// 내용이 실제로 바뀐 경우만 반영해요
		if (oldMessage.content === newMessage.content) return;

		const client = this.container.client;
		let content = newMessage.content;
		if (client.user) {
			content = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
		}
		await updateChannelHistoryMessage(newMessage.channelId, newMessage.id, content);
	}
}
