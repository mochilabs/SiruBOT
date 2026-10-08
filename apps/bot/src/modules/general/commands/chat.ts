import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { appEmoji } from '@sirubot/utils';
import {
	ChatServiceError,
	acquireChannelTurn,
	clearChannelHistory,
	collectImageUrls,
	getChatConfig,
	registerChatAbort,
	releaseChannelTurn,
	releaseChatAbort,
	runChatTurn,
	tryConsumeUserTurn
} from '../../../services/aiChatService.ts';
import type { AiToolContext } from '../../../services/aiTools/index.ts';
import { errorPayload, finalPayload, livePayload, statusPayload, stoppedPayload } from '../utils/chatView.ts';

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
				message: `${appEmoji('error', '❌')} AI 서버가 설정되지 않았어요. \`apps/bot/.env\`에 \`CHAT_MODEL\`을(를) 설정해 주세요.`,
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
				message: `${appEmoji('error', '❌')} 대화 기록을 저장할 채널이 없어요.`,
				context: { ephemeral: true }
			});
		}

		if (reset) clearChannelHistory(channelId);

		const attachment = interaction.options.getAttachment('image');
		const images = collectImageUrls(attachment ? [attachment] : []);
		if (attachment && images.length === 0) {
			throw new UserError({
				identifier: 'chat_image_unsupported',
				message: `${appEmoji('error', '❌')} 이미지는 10MB 이하의 이미지 파일(PNG·JPG 등)만 보낼 수 있어요.`,
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

		// 유저당 시간당 턴 상한 — 초과 시 안내 후 종료
		if (!(await tryConsumeUserTurn(interaction.user.id))) {
			throw new UserError({
				identifier: 'chat_rate_limited',
				message: `${appEmoji('hourglass', '⏳')} AI 대화 시간당 사용량을 모두 썼어요. 잠시 후(10분 뒤) 다시 시도해 주세요.`,
				context: { ephemeral: true }
			});
		}

		// 같은 채널에서 이미 턴이 돌고 있으면 겹쳐 쓰지 않아요 (멘션 답변과 히스토리 경쟁 방지)
		if (!acquireChannelTurn(channelId)) {
			await interaction
				.reply({
					...errorPayload(`${appEmoji('hourglass', '⏳')} 이 채널에서 이미 답변하는 중이에요. 잠시 후 다시 시도해 주세요.`),
					flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
				})
				.catch(() => undefined);
			return;
		}

		const { key: cancelKey, controller } = registerChatAbort(interaction.user.id);
		try {
			await interaction.deferReply();

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
					// 중지든 오류든 라이브 메시지를 그 자리에서 교체해 "생각 중"이 남지 않게 해요
					const stopped = error.identifier === 'chat_cancelled';
					await interaction.editReply(stopped ? stoppedPayload() : errorPayload(error.message)).catch(() => undefined);
					return;
				}
				await interaction.editReply(errorPayload('일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.')).catch(() => undefined);
				throw error;
			}

			// 턴 도중/직후 중지가 수락됐으면 최종 답변으로 덮지 않아요
			if (controller.signal.aborted) {
				await interaction.editReply(stoppedPayload()).catch(() => undefined);
				return;
			}

			await interaction.editReply(finalPayload(answer, { memoryUpdated }));
		} finally {
			// 초기 편집이 실패해도 abort 키가 새지 않도록 여기서 보장해요
			releaseChatAbort(cancelKey);
			releaseChannelTurn(channelId);
		}
	}
}
