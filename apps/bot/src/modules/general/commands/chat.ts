import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { acquireChatTurn, clearChannelHistory, collectImageUrls, getChatConfig } from '../../../services/aiChatService.ts';
import type { AiToolContext } from '../../../services/aiTools/index.ts';
import { runChatTurnToScreen } from '../utils/chatTurnRunner.ts';
import { errorPayload, livePayload } from '../utils/chatView.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'chat',
	description: "Chat with the AI. It remembers this channel's conversation.",
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
				message: `${emoji('error')} AI 서버가 설정되지 않았어요. \`apps/bot/.env\`에 \`CHAT_MODEL\`을(를) 설정해 주세요.`,
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
				message: `${emoji('error')} 대화 기록을 저장할 채널이 없어요.`,
				context: { ephemeral: true }
			});
		}

		if (reset) clearChannelHistory(channelId);

		const attachment = interaction.options.getAttachment('image');
		const images = collectImageUrls(attachment ? [attachment] : []);
		if (attachment && images.length === 0) {
			throw new UserError({
				identifier: 'chat_image_unsupported',
				message: `${emoji('error')} 이미지는 10MB 이하의 이미지 파일(PNG·JPG 등)만 보낼 수 있어요.`,
				context: { ephemeral: true }
			});
		}

		const toolContext: AiToolContext = {
			guildId: interaction.guildId,
			channelId,
			voiceChannelId: interaction.inCachedGuild() ? (interaction.member.voice?.channelId ?? null) : null,
			member: interaction.inCachedGuild() ? interaction.member : null,
			userId: interaction.user.id,
			username: interaction.user.username
		};

		// 같은 채널에서 이미 턴이 돌고 있으면 겹쳐 쓰지 않아요 (멘션 답변과 히스토리 경쟁 방지).
		// 채널 턴을 확보한 뒤에 유저 사용량을 소모하고, 소모에 실패하면 채널 턴도 바로 돌려줘요.
		const turn = await acquireChatTurn(channelId, interaction.user.id);
		if (!turn.ok) {
			if (turn.denial === 'rate_limited') {
				throw new UserError({
					identifier: 'chat_rate_limited',
					message: `${emoji('hourglass')} AI 대화 10분 사용량을 모두 썼어요. 잠시 후 다시 시도해 주세요.`,
					context: { ephemeral: true }
				});
			}
			await interaction
				.reply({
					...errorPayload(`${emoji('hourglass')} 이 채널에서 이미 답변하는 중이에요. 잠시 후 다시 시도해 주세요.`),
					flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
				})
				.catch(() => undefined);
			return;
		}

		try {
			await interaction.deferReply();
			await runChatTurnToScreen({
				config,
				userId: interaction.user.id,
				channelId,
				prompt,
				images,
				toolContext,
				author: interaction.inCachedGuild() ? interaction.member.displayName : interaction.user.displayName,
				screen: {
					create: (cancelKey) => interaction.editReply(livePayload('', cancelKey)),
					edit: (payload) => interaction.editReply(payload)
				}
			});
		} finally {
			// 초기 편집이 실패해도 턴 잠금이 새지 않도록 여기서 보장해요
			turn.release();
		}
	}
}
