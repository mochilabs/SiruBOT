import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction } from 'discord.js';
import {
	ChatServiceError,
	clearChannelHistory,
	collectImageUrls,
	getChatConfig,
	registerChatAbort,
	releaseChatAbort,
	runChatTurn
} from '../../../services/aiChatService.ts';
import type { AiToolContext } from '../../../services/aiTools/index.ts';
import { finalPayload, livePayload, statusPayload, stoppedPayload } from '../utils/chatView.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'chat',
	description: 'AI와 대화해요. 대화 기록은 채널 단위로 기억해요.',
	fullCategory: ['일반']
})
export class ChatCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '채팅' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: 'AI와 대화해요. 같은 채널에서는 대화를 이어서 기억해요.' })
				.addStringOption((option) =>
					option
						.setName('prompt')
						.setNameLocalizations({ ko: '질문' })
						.setDescription('Your message to the AI')
						.setDescriptionLocalizations({ ko: 'AI에게 보낼 메시지' })
						.setRequired(true)
						.setMaxLength(2000)
				)
				.addBooleanOption((option) =>
					option
						.setName('reset')
						.setNameLocalizations({ ko: '리셋' })
						.setDescription('Reset conversation history before sending')
						.setDescriptionLocalizations({ ko: '보내기 전에 이 채널의 대화 기록을 초기화해요.' })
				)
				.addAttachmentOption((option) =>
					option
						.setName('image')
						.setNameLocalizations({ ko: '이미지' })
						.setDescription('Attach an image for the AI to look at')
						.setDescriptionLocalizations({ ko: 'AI에게 보여줄 이미지를 첨부해요.' })
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const config = getChatConfig();
		if (!config) {
			throw new UserError({
				identifier: 'chat_not_configured',
				message: '❌ AI 서버가 설정되지 않았어요. `apps/bot/.env`에 `CHAT_MODEL`을(를) 설정해 주세요.',
				context: { ephemeral: true }
			});
		}

		const prompt = interaction.options.getString('prompt', true);
		const reset = interaction.options.getBoolean('reset') ?? false;
		// 대화 기록은 항상 채널 단위로만 저장한다 (사용자별 키는 쓰지 않음)
		const channelId = interaction.channelId;
		if (!channelId) {
			throw new UserError({
				identifier: 'chat_no_channel',
				message: '❌ 대화 기록을 저장할 채널이 없어요.',
				context: { ephemeral: true }
			});
		}

		if (reset) clearChannelHistory(channelId);

		const attachment = interaction.options.getAttachment('image');
		const images = collectImageUrls(attachment ? [attachment] : []);
		if (attachment && images.length === 0) {
			throw new UserError({
				identifier: 'chat_image_unsupported',
				message: '❌ 이미지는 10MB 이하의 이미지 파일(PNG·JPG 등)만 보낼 수 있어요.',
				context: { ephemeral: true }
			});
		}

		const toolContext: AiToolContext = {
			guildId: interaction.guildId,
			channelId,
			voiceChannelId: interaction.inCachedGuild() ? (interaction.member.voice?.channelId ?? null) : null,
			userId: interaction.user.id,
			username: interaction.user.username
		};

		await interaction.deferReply();

		const { key: cancelKey, controller } = registerChatAbort(interaction.user.id);
		let lastEditAt = 0;
		const editLive = async (text: string) => {
			await interaction.editReply(livePayload(text, cancelKey)).catch(() => undefined);
		};
		const onDelta = async (text: string) => {
			const now = Date.now();
			if (now - lastEditAt < config.streamUpdateMs || !text) return;
			lastEditAt = now;
			await editLive(text);
		};
		const onStatus = async (status: string) => {
			lastEditAt = Date.now();
			await interaction.editReply(statusPayload(status, cancelKey)).catch(() => undefined);
		};

		const liveMessage = await interaction.editReply(livePayload('', cancelKey));

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
				author: interaction.inCachedGuild() ? interaction.member.displayName : interaction.user.displayName,
				assistantMessageId: liveMessage.id,
				onDelta,
				onStatus
			});
			answer = turn.answer;
			memoryUpdated = turn.memoryUpdated;
		} catch (error) {
			if (error instanceof ChatServiceError) {
				if (error.identifier === 'chat_cancelled') {
					await interaction.editReply(stoppedPayload()).catch(() => undefined);
					return;
				}
				throw new UserError({
					identifier: error.identifier,
					message: `❌ ${error.message}`,
					context: { ephemeral: true }
				});
			}
			throw error;
		} finally {
			releaseChatAbort(cancelKey);
		}

		await interaction.editReply(finalPayload(answer, { memoryUpdated }));
	}
}
