import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message, MessageFlags } from 'discord.js';
import {
	ChatServiceError,
	collectImageUrls,
	getChatConfig,
	registerChatAbort,
	releaseChatAbort,
	runChatTurn,
	type ChatConfig
} from '../../../../services/aiChatService.ts';
import type { AiToolContext } from '../../../../services/aiTools/index.ts';
import { errorPayload, finalPayload, livePayload, statusPayload, stoppedPayload } from '../../utils/chatView.ts';

@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class MentionReplyListener extends Listener {
	private readonly inFlight = new Set<string>();

	public override async run(message: Message) {
		if (message.author.bot) return;
		const client = this.container.client;
		if (!client.user || !message.mentions.has(client.user)) return;

		const config = getChatConfig();
		if (!config) return;

		if (!message.channel.isSendable()) return;

		const channelId = message.channelId;
		if (this.inFlight.has(channelId)) return;

		const prompt = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
		const images = collectImageUrls([...message.attachments.values()]);
		if (!prompt && images.length === 0) {
			await message
				.reply({
					content: '-# 💡 질문을 멘션 뒤에 이어서 써 주세요. 예: `@시루 내일 날씨 어때?`',
					flags: [MessageFlags.SuppressNotifications],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
			return;
		}

		this.inFlight.add(channelId);
		try {
			await this.respond(message, prompt, images, config);
		} catch (error) {
			this.container.logger.error('[mentionReply] Failed to respond:', error);
		} finally {
			this.inFlight.delete(channelId);
		}
	}

	private async respond(message: Message, prompt: string, images: string[], config: ChatConfig) {
		const channelId = message.channelId;
		const toolContext: AiToolContext = {
			guildId: message.guildId,
			channelId,
			voiceChannelId: message.member?.voice?.channelId ?? null,
			userId: message.author.id,
			username: message.author.username
		};

		const { key: cancelKey, controller } = registerChatAbort(message.author.id);
		const reply = await message.reply(livePayload('', cancelKey));

		let lastEditAt = 0;
		const onDelta = async (text: string) => {
			const now = Date.now();
			if (now - lastEditAt < config.streamUpdateMs || !text) return;
			lastEditAt = now;
			await reply.edit(livePayload(text, cancelKey)).catch(() => undefined);
		};
		const onStatus = async (status: string) => {
			lastEditAt = Date.now();
			await reply.edit(statusPayload(status, cancelKey)).catch(() => undefined);
		};

		let answer: string;
		let memoryUpdated = false;
		try {
			const turn = await runChatTurn({
				channelId,
				prompt,
				config,
				toolContext,
				images,
				signal: controller.signal,
				author: message.member?.displayName ?? message.author.displayName,
				userMessageId: message.id,
				assistantMessageId: reply.id,
				excludeMessageId: message.id,
				onDelta,
				onStatus
			});
			answer = turn.answer;
			memoryUpdated = turn.memoryUpdated;
		} catch (error) {
			if (error instanceof ChatServiceError && error.identifier === 'chat_cancelled') {
				await reply.edit(stoppedPayload()).catch(() => undefined);
				return;
			}
			const text = error instanceof ChatServiceError ? error.message : '알 수 없는 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';
			await reply.edit(errorPayload(text)).catch(() => undefined);
			return;
		} finally {
			releaseChatAbort(cancelKey);
		}

		await reply.edit(finalPayload(answer, { memoryUpdated })).catch(() => undefined);
	}
}
