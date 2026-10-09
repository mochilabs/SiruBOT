import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message, MessageFlags } from 'discord.js';
import {
	ChatServiceError,
	acquireChannelTurn,
	collectImageUrls,
	getAiChatPolicy,
	assertChatEnabled,
	getChatConfig,
	registerChatAbort,
	releaseChannelTurn,
	releaseChatAbort,
	runChatTurn,
	tryConsumeUserTurn,
	type ChatConfig
} from '../../../../services/aiChatService.ts';
import type { AiToolContext } from '../../../../services/aiTools/index.ts';
import { emoji } from '@sirubot/utils';
import { errorPayload, finalPayload, livePayload, statusPayload, stoppedPayload } from '../../utils/chatView.ts';

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

		// 유저당 턴 상한(10분 윈도우) — 초과 시 조용히 안내해요
		if (!(await tryConsumeUserTurn(message.author.id))) {
			await message
				.reply({
					content: `-# ${emoji('hourglass')} AI 대화 10분 사용량을 모두 썼어요. 잠시 후 다시 멘션해 주세요.`,
					flags: [MessageFlags.SuppressNotifications],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
			return;
		}

		// 같은 채널 턴이 진행 중이면 조용히 무시하지 않고 안내해요
		if (!acquireChannelTurn(channelId)) {
			await message
				.reply({
					content: `-# ${emoji('hourglass')} 방금 멘션에 답변하는 중이에요. 잠시 후 다시 멘션해 주세요.`,
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
			releaseChannelTurn(channelId);
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

		const { key: cancelKey, controller } = registerChatAbort(message.author.id);
		try {
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
			}

			// 턴 도중/직후 중지가 수락됐으면 최종 답변으로 덮지 않아요
			if (controller.signal.aborted) {
				await reply.edit(stoppedPayload()).catch(() => undefined);
				return;
			}

			await reply.edit(finalPayload(answer, { memoryUpdated })).catch(() => undefined);
		} finally {
			// 첫 reply가 실패해도 abort 키가 새지 않도록 여기서 보장해요
			releaseChatAbort(cancelKey);
		}
	}
}
