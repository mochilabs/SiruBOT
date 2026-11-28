import { notice } from '../../../../lib/notice.ts';
import { confirmAction } from '../../../../lib/confirmation.ts';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message, MessageFlags } from 'discord.js';
import { ChatServiceError, collectImageUrls, assertChatEnabled, type ChatConfig, type ChatImage } from '../../application/aiChatService.ts';
import { getChatConfig } from '../../chatConfig.ts';
import type { AiToolContext } from '../../application/aiTools/index.ts';
import { emoji } from '@sirubot/utils';
import { runChatTurnToScreen } from '../chatTurnRunner.ts';
import { errorPayload, livePayload } from '../views/chatView.ts';
import { usageFeatureKey } from '@sirubot/utils/modules';
import { isMessageFeatureEnabled } from '../../../../services/guildSettings/modules.ts';
import { inGuildTheme } from '../../../../lib/guildThemeScope.ts';
@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class MentionReplyListener extends Listener {
	public override async run(message: Message) {
		if (message.author.bot) return;
		const client = this.container.client;
		if (!client.user) return;

		const hasExplicitMention = new RegExp(`<@!?${client.user.id}>`).test(message.content);
		if (!hasExplicitMention && !message.mentions.has(client.user, { ignoreEveryone: true })) return;

		if (!(await isMessageFeatureEnabled(this.container.guildService, message.guildId, 'ai-mention'))) return;

		// 답장으로 인한 암묵적 멘션은 실제 AI 답변에 답장한 경우만 허용해요.
		if (!hasExplicitMention && message.reference?.messageId) {
			const isAiMessage = await this.container.aiChatHistory.isAiAssistantMessage(message.channelId, message.reference.messageId);
			if (!isAiMessage) return;
		}

		const config = getChatConfig();
		if (!config) return;
		if (!message.channel.isSendable()) return;

		const channelId = message.channelId;

		const policy = await this.container.aiChat.getAiChatPolicy(message.guildId);
		try {
			assertChatEnabled(policy, channelId);
		} catch (error) {
			if (error instanceof ChatServiceError && error.identifier === 'chat_disabled') return;
			const text = error instanceof ChatServiceError ? error.message : '이 채널에서는 AI 채팅을 사용할 수 없어요.';
			await message.reply(errorPayload(text)).catch(() => undefined);
			return;
		}

		this.container.usageRecorder?.record(message.guildId, usageFeatureKey('msg', 'ai-mention'), message.author.id);

		const prompt = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
		const images = collectImageUrls([...message.attachments.values()]);
		if (!prompt && images.length === 0) {
			await message
				.reply({
					components: [
						await inGuildTheme(message.guildId, () =>
							notice(`-# ${emoji('bulb')} 질문을 멘션 뒤에 이어서 써 주세요. 예: \`@시루 내일 날씨 어때?\``)
						)
					],
					flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
			return;
		}

		// 같은 채널 턴이 진행 중이면 조용히 무시하지 않고 안내해요.
		// 채널 턴을 확보한 뒤에 유저 사용량을 소모하고, 소모에 실패하면 채널 턴도 바로 돌려줘요.
		const turn = await this.container.aiChat.acquireChatTurn(channelId, message.author.id);
		if (!turn.ok) {
			const denial = turn.denial;
			await message
				.reply({
					components: [
						await inGuildTheme(message.guildId, () =>
							notice(
								denial === 'channel_busy'
									? `-# ${emoji('hourglass')} 방금 멘션에 답변하는 중이에요. 잠시 후 다시 멘션해 주세요.`
									: `-# ${emoji('hourglass')} AI 대화 10분 사용량을 모두 썼어요. 잠시 후 다시 멘션해 주세요.`
							)
						)
					],
					flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
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

	private async respond(message: Message, prompt: string, images: readonly ChatImage[], config: ChatConfig) {
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
			runChatTurn: this.container.aiChat.runChatTurn,
			registerChatAbort: this.container.aiChat.registerChatAbort,
			releaseChatAbort: this.container.aiChat.releaseChatAbort,
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
				edit: (payload) => (live ? live.edit(payload) : Promise.resolve(null)),
				// 상호작용이 없어서 라이브 메시지를 확인 창 자리로 써요 — 요청자(메시지 작성자)만 누를 수 있어요
				confirm: (title, description) => {
					const target = live as Message | null;
					if (!target) return Promise.resolve(false);
					return confirmAction({ user: message.author, editReply: (options) => target.edit(options) }, title, description);
				}
			}
		});
	}
}
