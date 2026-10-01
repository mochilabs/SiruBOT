import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Collection, Message } from 'discord.js';
import { removeFromChannelHistory } from '../../../../services/aiChatService.ts';

/** 일괄 삭제(청소 포함)된 메시지들을 AI 채널 기록에서 한 번에 제거해요 */
@ApplyOptions<Listener.Options>({
	event: 'messageDeleteBulk'
})
export class AiHistoryMessageBulkDeletedListener extends Listener {
	public override async run(messages: Collection<string, Message>): Promise<void> {
		const first = messages.first();
		if (!first?.channelId || messages.size === 0) return;
		await removeFromChannelHistory(first.channelId, new Set(messages.keys()));
	}
}
