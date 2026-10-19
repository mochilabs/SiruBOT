import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { type ChatToolName } from '../../../services/guildService.ts';
import { resetCountingState } from '../../../services/countingState.ts';

/**
 * /채팅유틸 — 채팅 유틸 기능의 채널 단위 on/off + 카운팅 채널 지정.
 * - 채널: 이모지 확대·메시지 인용·임베드 복구를 이 채널에서 켜거나 꺼요. 길드 정책이라
 *   서버 관리 권한이 필요해요 (토글 규칙은 AI 채팅·TTS와 같아요 — guildService.computeChannelToggle).
 * - 카운팅: 카운팅 채널을 지정하거나(기본: 이 채널) 카운팅을 꺼요. 지정 순간 상태가 초기화돼요.
 */
const FEATURE_LABELS: Record<ChatToolName, string> = {
	emojiEnlarge: '이모지 확대',
	quote: '메시지 인용',
	embedFix: '임베드 복구'
};

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'chattools',
	description: '채팅 유틸 기능을 채널별로 켜고 끄고 카운팅 채널을 지정해요.',
	fullCategory: ['일반']
})
export class ChatToolsCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '채팅유틸' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '채팅 유틸 기능을 채널별로 켜고 끄고 카운팅 채널을 지정해요.' })
				.addSubcommand((sub) =>
					sub
						.setName('channel')
						.setNameLocalizations({ ko: '채널' })
						.setDescription('Toggle a chat tool for this channel.')
						.setDescriptionLocalizations({ ko: '이 채널에서 채팅 유틸 기능을 켜거나 꺼요.' })
						.addStringOption((option) =>
							option
								.setName('feature')
								.setNameLocalizations({ ko: '기능' })
								.setDescription('The chat tool to toggle.')
								.setDescriptionLocalizations({ ko: '켜거나 끌 기능이에요.' })
								.setRequired(true)
								.addChoices(
									{ name: '이모지 확대', value: 'emojiEnlarge' },
									{ name: '메시지 인용', value: 'quote' },
									{ name: '임베드 복구', value: 'embedFix' }
								)
						)
						.addStringOption((option) =>
							option
								.setName('state')
								.setNameLocalizations({ ko: '상태' })
								.setDescription('Whether to enable or disable.')
								.setDescriptionLocalizations({ ko: '켜기 또는 끄기예요.' })
								.setRequired(true)
								.addChoices({ name: '켜기', value: 'on' }, { name: '끄기', value: 'off' })
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('counting')
						.setNameLocalizations({ ko: '카운팅' })
						.setDescription('Designate the counting channel.')
						.setDescriptionLocalizations({ ko: '카운팅 채널을 지정하거나 카운팅을 꺼요.' })
						.addChannelOption((option) =>
							option
								.setName('channel')
								.setNameLocalizations({ ko: '채널' })
								.setDescription('Channel to count in.')
								.setDescriptionLocalizations({ ko: '숫자를 셀 채널이에요. 비워 두면 이 채널로 지정해요.' })
								.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
						)
						.addStringOption((option) =>
							option
								.setName('state')
								.setNameLocalizations({ ko: '상태' })
								.setDescription('Whether to enable or disable counting.')
								.setDescriptionLocalizations({ ko: '지정 또는 끄기예요. 기본값은 지정이에요.' })
								.addChoices({ name: '지정', value: 'on' }, { name: '끄기', value: 'off' })
						)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'chattools_no_guild',
				message: `${emoji('error')} 서버 안에서만 사용할 수 있어요.`,
				context: { ephemeral: true }
			});
		}

		// 두 서브커맨드 모두 채널 전체에 영향을 주는 길드 정책이에요.
		if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
			throw new UserError({
				identifier: 'chattools_permission',
				message: `${emoji('error')} 채팅 유틸 설정은 서버 관리 권한이 필요해요.`,
				context: { ephemeral: true }
			});
		}

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		const subcommand = interaction.options.getSubcommand(true);

		if (subcommand === 'counting') {
			await this.runCounting(interaction);
			return;
		}

		const tool = interaction.options.getString('feature', true) as ChatToolName;
		const enable = interaction.options.getString('state', true) === 'on';
		if (!(tool in FEATURE_LABELS)) {
			throw new UserError({
				identifier: 'chattools_unknown_feature',
				message: `${emoji('error')} 알 수 없는 기능이에요.`,
				context: { ephemeral: true }
			});
		}

		// 끄기로 all → channels를 만들 때 남길 목록을 위해 서버의 나머지 텍스트 채널을 모아요.
		const otherTextChannelIds = interaction.guild.channels.cache
			.filter(
				(channel) =>
					channel.id !== interaction.channelId && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
			)
			.map((channel) => channel.id);
		const result = await this.container.guildService.setChannelChatToolEnabled(
			interaction.guildId,
			tool,
			interaction.channelId,
			enable,
			otherTextChannelIds
		);
		const label = FEATURE_LABELS[tool];

		if (enable) {
			const content =
				result.mode === 'all'
					? `${emoji('sparkle')} ${label}는 이미 서버의 모든 채널에서 켜져 있어요.`
					: `${emoji('sparkle')} 지금부터 <#${interaction.channelId}>에서 ${label}를 켰어요.`;
			await interaction.editReply({ allowedMentions: { parse: [] }, content });
			return;
		}

		const content =
			result.mode === 'off'
				? `${emoji('sparkle')} 이 채널의 ${label}를 껐어요. 허용된 채널이 더 없어서 서버에서 ${label}가 모두 꺼졌어요.`
				: `${emoji('sparkle')} 이 채널의 ${label}를 껐어요. (남은 허용 채널 ${result.channelIds.length}개)`;
		await interaction.editReply({ allowedMentions: { parse: [] }, content });
	}

	/** 카운팅 서브커맨드 — 채널 지정(기본: 이 채널) 또는 끄기. 상태는 새로 시작해요 */
	private async runCounting(interaction: ChatInputCommandInteraction<'cached'>) {
		if (interaction.options.getString('state') === 'off') {
			await this.container.guildService.setCountingEnabled(interaction.guildId, false);
			await resetCountingState(interaction.guildId);
			await interaction.editReply({ allowedMentions: { parse: [] }, content: `${emoji('crown')} 카운팅을 껐어요.` });
			return;
		}

		const channel = interaction.options.getChannel('channel');
		const channelId = channel?.id ?? interaction.channelId;
		await this.container.guildService.setCountingChannel(interaction.guildId, channelId);
		await resetCountingState(interaction.guildId);
		await interaction.editReply({
			allowedMentions: { parse: [] },
			content: `${emoji('crown')} <#${channelId}>을(를) 카운팅 채널로 지정했어요. 1부터 차례로 숫자를 세어 보세요!`
		});
	}
}
