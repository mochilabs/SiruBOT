import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Collection, Message, type BaseChannel } from 'discord.js';
import { removeFromChannelHistory } from '../../../../services/aiChatService.ts';

/** 일괄 삭제(청소 포함)된 메시지들을 AI 채널 기록에서 한 번에 제거해요 */
@ApplyOptions<Listener.Options>({
	event: 'messageDeleteBulk'
})
export class AiHistoryMessageBulkDeletedListener extends Listener {
	public override async run(messages: Collection<string, Message>, channel?: BaseChannel): Promise<void> {
		if (messages.size === 0) return;
		// d.js가 전달하는 channel 인자를 우선하고, 없으면 메시지에서 채널을 찾아요
		const channelId = channel?.id ?? messages.first()?.channelId;
		if (!channelId) return;
		await removeFromChannelHistory(channelId, new Set(messages.keys()));
	}
}
