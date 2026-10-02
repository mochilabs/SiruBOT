import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { getAiChatPolicy } from '../../../services/aiChatService.ts';

const MODEL_MAX = 100;
const PROMPT_MAX = 1000;

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'chat-settings',
	description: '서버와 채널의 AI 채팅 설정을 관리해요.',
	fullCategory: ['일반'],
	preconditions: ['ManageGuild']
})
export class ChatSettingsCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
				.setName(this.name)
				.setNameLocalizations({ ko: '채팅설정' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '서버·채널의 AI 채팅 on/off, 모델, 시스템 프롬프트를 설정해요.' })
				.addSubcommand((sub) =>
					sub
						.setName('server')
						.setNameLocalizations({ ko: '서버' })
						.setDescription('Enable or disable AI chat for this server.')
						.setDescriptionLocalizations({ ko: '이 서버의 AI 채팅을 켜거나 꺼요.' })
						.addBooleanOption((option) =>
							option
								.setName('enabled')
								.setNameLocalizations({ ko: '켜기' })
								.setDescription('Whether AI chat is enabled.')
								.setDescriptionLocalizations({ ko: 'AI 채팅 사용 여부예요.' })
								.setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('channel')
						.setNameLocalizations({ ko: '채널' })
						.setDescription('Enable or disable AI chat for this channel.')
						.setDescriptionLocalizations({ ko: '현재 채널의 AI 채팅을 켜거나 꺼요.' })
						.addBooleanOption((option) =>
							option
								.setName('enabled')
								.setNameLocalizations({ ko: '켜기' })
								.setDescription('Whether AI chat is enabled in this channel.')
								.setDescriptionLocalizations({ ko: '현재 채널에서 AI 채팅 사용 여부예요.' })
								.setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('model')
						.setNameLocalizations({ ko: '모델' })
						.setDescription('View or override the AI model for this server.')
						.setDescriptionLocalizations({ ko: '서버 AI 모델을 조회하거나 바꿔요. 비워두면 env 기본값이에요.' })
						.addStringOption((option) =>
							option
								.setName('value')
								.setNameLocalizations({ ko: '모델' })
								.setDescription('Model name to use (leave empty to view, use "기본" to reset).')
								.setDescriptionLocalizations({ ko: '모델 이름이에요. 비우면 조회, "기본"이면 env 기본값으로 되돌려요.' })
								.setMaxLength(MODEL_MAX)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('prompt')
						.setNameLocalizations({ ko: '프롬프트' })
						.setDescription('View or set extra system prompt for this server.')
						.setDescriptionLocalizations({ ko: '서버 추가 시스템 지침을 조회하거나 설정해요. "기본"이면 제거해요.' })
						.addStringOption((option) =>
							option
								.setName('text')
								.setNameLocalizations({ ko: '지침' })
								.setDescription('Extra instructions to append (leave empty to view, use "기본" to reset).')
								.setDescriptionLocalizations({ ko: '추가할 지침이에요. 비우면 조회, "기본"이면 제거해요.' })
								.setMaxLength(PROMPT_MAX)
						)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'chat_settings_no_guild',
				message: '❌ 서버 안에서만 사용할 수 있어요.',
				context: { ephemeral: true }
			});
		}

		const guildId = interaction.guildId;
		const subcommand = interaction.options.getSubcommand(true);
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		if (subcommand === 'server') {
			const enabled = interaction.options.getBoolean('enabled', true);
			await this.container.guildService.setAiEnabled(guildId, enabled);
			await interaction.editReply({ allowedMentions: { parse: [] }, content: `🤖 이 서버의 AI 채팅을 **${enabled ? '켰어요' : '껐어요'}**.` });
			return;
		}

		if (subcommand === 'channel') {
			const enabled = interaction.options.getBoolean('enabled', true);
			const disabledIds = await this.container.guildService.setChannelAiEnabled(guildId, interaction.channelId, enabled);
			await interaction.editReply({
				allowedMentions: { parse: [] },
				content: `💬 이 채널의 AI 채팅을 **${enabled ? '켰어요' : '껐어요'}**. (서버 전체 꺼진 채널 ${disabledIds.length}개)`
			});
			return;
		}

		if (subcommand === 'model') {
			const value = interaction.options.getString('value');
			if (value === null) {
				const policy = await getAiChatPolicy(guildId);
				await interaction.editReply({ allowedMentions: { parse: [] }, content: `🧠 현재 모델: **${policy.model ?? 'env 기본값'}**` });
				return;
			}
			const trimmed = value.trim();
			if (trimmed === '기본' || trimmed === '') {
				await this.container.guildService.setAiModel(guildId, null);
				await interaction.editReply({ allowedMentions: { parse: [] }, content: '🧠 모델 설정을 **env 기본값**으로 되돌렸어요.' });
				return;
			}
			await this.container.guildService.setAiModel(guildId, trimmed);
			await interaction.editReply({ allowedMentions: { parse: [] }, content: `🧠 모델을 **${trimmed}**(으)로 바꿨어요.` });
			return;
		}

		// prompt
		const text = interaction.options.getString('text');
		if (text === null) {
			const policy = await getAiChatPolicy(guildId);
			await interaction.editReply({
				allowedMentions: { parse: [] },
				content: policy.systemPrompt ? `📜 현재 추가 지침:\n${policy.systemPrompt}` : '📜 설정된 추가 지침이 없어요.'
			});
			return;
		}
		const trimmed = text.trim();
		if (trimmed === '기본' || trimmed === '') {
			await this.container.guildService.setAiSystemPrompt(guildId, null);
			await interaction.editReply({ allowedMentions: { parse: [] }, content: '📜 추가 지침을 **제거**했어요.' });
			return;
		}
		await this.container.guildService.setAiSystemPrompt(guildId, trimmed);
		await interaction.editReply({ allowedMentions: { parse: [] }, content: `📜 추가 지침을 설정했어요:\n${trimmed}` });
	}
}
