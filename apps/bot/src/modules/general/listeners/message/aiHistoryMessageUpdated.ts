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
		// 캐시되지 않은 메시지의 부분 업데이트(partial)는 author/content가 없을 수 있어요 — 스킵
		if (newMessage.partial || !newMessage.author) return;
		if (newMessage.author.bot) return;
		if (!newMessage.channelId || !newMessage.id) return;
		// 내용이 실제로 바뀐 경우만 반영해요
		if (oldMessage.content === newMessage.content) return;

		const client = this.container.client;
		let content = newMessage.content;
		if (client.user) {
			content = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
		}
		// 멘션만 지우는 편집 등으로 내용이 비면 기록을 지우지 않고 유지해요 (실제 삭제는 delete 리스너가 처리)
		if (!content) return;
		await updateChannelHistoryMessage(newMessage.channelId, newMessage.id, content);
	}
}
