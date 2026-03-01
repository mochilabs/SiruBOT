import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, ContainerBuilder, MessageFlags } from 'discord.js';
import { DEFAULT_COLOR } from '@sirubot/utils';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'history',
	description: '이 서버에서 재생된 최근 음악 기록을 보여줘요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed']
})
export class HistoryCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '기록' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '이 서버에서 최근 재생된 음악 기록을 보여줍니다.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		const history = await this.container.db.guildTrackHistory.findMany({
			where: { guildId: interaction.guildId },
			orderBy: { createdAt: 'desc' },
			take: 15,
			include: { track: true }
		});

		if (history.length === 0) {
			await interaction.editReply({
				content: '❌ 최근 재생된 음악 기록이 없어요.'
			});
			return;
		}

		const lines = history.map((h, _i) => {
			const timeStr = h.createdAt.toLocaleString('ko-KR', {
				timeZone: 'Asia/Seoul',
				month: '2-digit',
				day: '2-digit',
				hour12: false,
				hour: '2-digit',
				minute: '2-digit'
			});
			const requesterStr = h.userId ? ` | <@${h.userId}>` : '';
			return `\`${timeStr}\` **[${h.track.title}](${h.track.url})** - ${h.track.artist}${requesterStr}`;
		});

		const containerComponent = new ContainerBuilder()
			.setAccentColor(DEFAULT_COLOR)
			.addTextDisplayComponents((textDisplay) => textDisplay.setContent(`### 📜 최근 재생 기록\n\n${lines.join('\n')}`));

		await interaction.editReply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
