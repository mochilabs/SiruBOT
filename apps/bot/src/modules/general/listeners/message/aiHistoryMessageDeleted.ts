import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message } from 'discord.js';
import { removeFromChannelHistory } from '../../../../services/aiChatService.ts';

/** 삭제된 메시지를 AI 채널 기록에서 제거해요 (사용자 메시지는 봇 답변과 한 쌍으로) */
@ApplyOptions<Listener.Options>({
	event: Events.MessageDelete
})
export class AiHistoryMessageDeletedListener extends Listener {
	public override async run(message: Message): Promise<void> {
		if (!message.channelId || !message.id) return;
		await removeFromChannelHistory(message.channelId, new Set([message.id]));
	}
}
