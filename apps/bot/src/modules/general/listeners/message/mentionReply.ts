import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message, MessageFlags } from 'discord.js';
import { ChatServiceError, getChatConfig, runChatTurn, type ChatConfig } from '../../../../services/aiChatService.ts';
import type { AiToolContext } from '../../../../services/aiTools/index.ts';
import { errorContainer, finalContainer, liveContainer } from '../../utils/chatView.ts';

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
		if (!prompt) {
			await message
				.reply({
					content: '-# 💡 질문을 멘션 뒤에 이어서 써 주세요. 예: `@시루 내일 날씨 어때?`',
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
			return;
		}

		this.inFlight.add(channelId);
		try {
			await this.respond(message, prompt, config);
		} catch (error) {
			this.container.logger.error('[mentionReply] Failed to respond:', error);
		} finally {
			this.inFlight.delete(channelId);
		}
	}

	private async respond(message: Message, prompt: string, config: ChatConfig) {
		const channelId = message.channelId;
		const toolContext: AiToolContext = {
			guildId: message.guildId,
			channelId,
			voiceChannelId: message.member?.voice?.channelId ?? null,
			userId: message.author.id,
			username: message.author.username
		};

		const reply = await message.reply({
			components: [liveContainer('', config)],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { parse: [] }
		});

		let lastEditAt = 0;
		const editLive = async (text: string) => {
			await reply
				.edit({
					components: [liveContainer(text, config)],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
		};
		const onDelta = async (text: string) => {
			const now = Date.now();
			if (now - lastEditAt < config.streamUpdateMs || !text) return;
			lastEditAt = now;
			await editLive(text);
		};
		const onStatus = async (status: string) => {
			lastEditAt = Date.now();
			await editLive(`🔧 ${status}`);
		};

		let answer: string;
		let turnCount: number;
		try {
			({ answer, turnCount } = await runChatTurn({
				channelId,
				prompt,
				config,
				toolContext,
				author: message.member?.displayName ?? message.author.displayName,
				excludeMessageId: message.id,
				onDelta,
				onStatus
			}));
		} catch (error) {
			const text = error instanceof ChatServiceError ? error.message : '알 수 없는 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';
			await reply
				.edit({
					components: [errorContainer(text, config)],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
			return;
		}

		await reply
			.edit({
				components: [finalContainer(answer, config, turnCount)],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { parse: [] }
			})
			.catch(() => undefined);
	}
}
