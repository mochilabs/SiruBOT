import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { normalizeAiMode } from '../../../services/guildService.ts';

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
				.setDescriptionLocalizations({ ko: '서버·채널의 AI 채팅 on/off를 설정해요.' })
				.addSubcommand((sub) =>
					sub
						.setName('server')
						.setNameLocalizations({ ko: '서버' })
						.setDescription('Set how AI chat works for this server.')
						.setDescriptionLocalizations({ ko: '이 서버의 AI 채팅 모드를 바꿔요.' })
						.addStringOption((option) =>
							option
								.setName('mode')
								.setNameLocalizations({ ko: '모드' })
								.setDescription('AI chat mode: all channels, selected channels, or off.')
								.setDescriptionLocalizations({ ko: '모든 채널 / 특정 채널 / 끄기 중에서 골라요.' })
								.setRequired(true)
								.addChoices(
									{ name: '모든 채널', value: 'all' },
									{ name: '특정 채널', value: 'channels' },
									{ name: '끄기', value: 'off' }
								)
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
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'chat_settings_no_guild',
				message: `${emoji('error')} 서버 안에서만 사용할 수 있어요.`,
				context: { ephemeral: true }
			});
		}

		const guildId = interaction.guildId;
		const subcommand = interaction.options.getSubcommand(true);
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		if (subcommand === 'server') {
			const mode = normalizeAiMode(interaction.options.getString('mode', true));
			await this.container.guildService.setAiMode(guildId, mode);
			const current = await this.container.guildService.getAiSettings(guildId);
			const content =
				mode === 'all'
					? `${emoji('robot')} 이 서버의 AI 채팅을 **모든 채널**에서 켰어요.`
					: mode === 'off'
						? `${emoji('robot')} 이 서버의 AI 채팅을 **껐어요**.`
						: current.channelIds.length > 0
							? `${emoji('robot')} 이 서버의 AI 채팅을 **특정 채널**에서만 켜기로 바꿨어요. (허용 채널 ${current.channelIds.length}개)`
							: `${emoji('robot')} **특정 채널** 모드로 바꿨어요. 아직 허용된 채널이 없어서 지금은 아무 데서도 안 써요. \`/채팅설정 채널 켜기\`로 켜 주세요.`;
			await interaction.editReply({ allowedMentions: { parse: [] }, content });
			return;
		}

		if (subcommand === 'channel') {
			const enabled = interaction.options.getBoolean('enabled', true);
			// 끄기로 인해 목록을 만들어야 하는(all → channels) 경우를 위한 서버의 나머지 텍스트 채널
			const otherTextChannelIds = interaction.guild.channels.cache
				.filter(
					(channel) =>
						channel.id !== interaction.channelId &&
						(channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
				)
				.map((channel) => channel.id);
			const result = await this.container.guildService.setChannelAiEnabled(guildId, interaction.channelId, enabled, otherTextChannelIds);
			const content = enabled
				? `${emoji('speech')} 이 채널에서 AI 채팅을 **${result.mode === 'all' ? '켰어요 (서버 전체 켜짐)' : '켰어요'}**. (허용 채널 ${
						result.channelIds.length
					}개)`
				: result.mode === 'off'
					? `${emoji('speech')} 이 채널에서 AI 채팅을 껐고, 남은 허용 채널이 없어 **서버 전체를 껐어요**.`
					: `${emoji('speech')} 이 채널에서 AI 채팅을 **껐어요**. (남은 허용 채널 ${result.channelIds.length}개)`;
			await interaction.editReply({ allowedMentions: { parse: [] }, content });
			return;
		}
	}
}
