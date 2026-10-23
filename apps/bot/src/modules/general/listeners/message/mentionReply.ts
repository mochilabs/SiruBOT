import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message, MessageFlags } from 'discord.js';
import {
	ChatServiceError,
	acquireChatTurn,
	collectImageUrls,
	getAiChatPolicy,
	assertChatEnabled,
	getChatConfig,
	type ChatConfig
} from '../../../../services/aiChatService.ts';
import type { AiToolContext } from '../../../../services/aiTools/index.ts';
import { emoji } from '@sirubot/utils';
import { runChatTurnToScreen } from '../../utils/chatTurnRunner.ts';
import { errorPayload, livePayload } from '../../utils/chatView.ts';

@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class MentionReplyListener extends Listener {
	public override async run(message: Message) {
		if (message.author.bot) return;
		const client = this.container.client;
		// @everyone/@here 멘션은 무시 — 봇이 직접 멘션된 경우에만 응답해요
		if (!client.user || !message.mentions.has(client.user, { ignoreEveryone: true })) return;

		const config = getChatConfig();
		if (!config) return;

		if (!message.channel.isSendable()) return;

		const channelId = message.channelId;

		// 꺼진 서버/채널이면 라이브 메시지 없이 바로 오류로 알려요
		const policy = await getAiChatPolicy(message.guildId);
		try {
			assertChatEnabled(policy, channelId);
		} catch (error) {
			const text = error instanceof ChatServiceError ? error.message : '이 채널에서는 AI 채팅을 사용할 수 없어요.';
			await message.reply(errorPayload(text)).catch(() => undefined);
			return;
		}

		const prompt = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
		const images = collectImageUrls([...message.attachments.values()]);
		if (!prompt && images.length === 0) {
			await message
				.reply({
					content: `-# ${emoji('bulb')} 질문을 멘션 뒤에 이어서 써 주세요. 예: \`@시루 내일 날씨 어때?\``,
					flags: [MessageFlags.SuppressNotifications],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
			return;
		}

		// 같은 채널 턴이 진행 중이면 조용히 무시하지 않고 안내해요.
		// 채널 턴을 확보한 뒤에 유저 사용량을 소모하고, 소모에 실패하면 채널 턴도 바로 돌려줘요.
		const turn = await acquireChatTurn(channelId, message.author.id);
		if (!turn.ok) {
			const text =
				turn.denial === 'channel_busy'
					? `-# ${emoji('hourglass')} 방금 멘션에 답변하는 중이에요. 잠시 후 다시 멘션해 주세요.`
					: `-# ${emoji('hourglass')} AI 대화 10분 사용량을 모두 썼어요. 잠시 후 다시 멘션해 주세요.`;
			await message
				.reply({
					content: text,
					flags: [MessageFlags.SuppressNotifications],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
			return;
		}

		try {
			await this.respond(message, prompt, images, config);
		} catch (error) {
			this.container.logger.error('[mentionReply] Failed to respond:', error);
		} finally {
			turn.release();
		}
	}

	private async respond(message: Message, prompt: string, images: string[], config: ChatConfig) {
		const channelId = message.channelId;
		const toolContext: AiToolContext = {
			guildId: message.guildId,
			channelId,
			voiceChannelId: message.member?.voice?.channelId ?? null,
			member: message.inGuild() ? (message.member ?? null) : null,
			userId: message.author.id,
			username: message.author.username
		};

		let live: Message | null = null;
		await runChatTurnToScreen({
			config,
			userId: message.author.id,
			channelId,
			prompt,
			images,
			toolContext,
			author: message.member?.displayName ?? message.author.displayName,
			userMessageId: message.id,
			excludeMessageId: message.id,
			screen: {
				create: async (cancelKey) => {
					live = await message.reply(livePayload('', cancelKey));
					return live;
				},
				edit: (payload) => (live ? live.edit(payload) : Promise.resolve(null))
			}
		});
	}
}
