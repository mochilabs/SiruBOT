import { ApplyOptions } from '@sapphire/decorators';
import { Command, RegisterBehavior } from '@sapphire/framework';
import { ApplicationIntegrationType, AttachmentBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { getConfig } from '../../../lib/config.ts';
import { notice } from '../../../lib/notice.ts';
import type { WrappedCardRequest } from '../../../services/dataApiClient.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'wrapped',
	fullCategory: ['개발'],
	preconditions: ['OwnerOnly']
})
export class WrappedCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand(
			(builder) => {
				builder
					.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
					.setName(this.name)
					.setNameLocalizations({ ko: '결산' })
					.setDescription('Render your music Wrapped card (bot owner only).')
					.setDescriptionLocalizations({ ko: '내 음악 결산 카드를 만들어요. (봇 소유자 전용)' })
					.addStringOption((option) =>
						option
							.setName('period')
							.setNameLocalizations({ ko: '기간' })
							.setDescription('Period to summarize (default: last 30 days).')
							.setDescriptionLocalizations({ ko: '요약할 기간이에요. (기본: 최근 30일)' })
							.addChoices(
								{ name: 'Last 30 days', name_localizations: { ko: '최근 30일' }, value: 'month' },
								{ name: 'This year', name_localizations: { ko: '올해' }, value: 'year' },
								{ name: 'All time', name_localizations: { ko: '전체' }, value: 'all' }
							)
					)
					.addStringOption((option) =>
						option
							.setName('scope')
							.setNameLocalizations({ ko: '범위' })
							.setDescription('Which servers to count (default: all servers).')
							.setDescriptionLocalizations({ ko: '집계할 서버 범위예요. (기본: 모든 서버)' })
							.addChoices(
								{ name: 'All servers', name_localizations: { ko: '모든 서버' }, value: 'all' },
								{ name: 'This server', name_localizations: { ko: '이 서버' }, value: 'guild' }
							)
					);
			},
			{ guildIds: [...getConfig().discord.devGuildIds], behaviorWhenNotIdentical: RegisterBehavior.Overwrite }
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();

		const period = (interaction.options.getString('period') ?? 'month') as WrappedCardRequest['period'];
		const scope = interaction.options.getString('scope') ?? 'all';
		const png = await this.container.dataApi.renderWrappedCard({
			userId: interaction.user.id,
			guildId: scope === 'guild' ? interaction.guildId : null,
			displayName: interaction.user.displayName,
			avatarUrl: interaction.user.displayAvatarURL({ size: 128, extension: 'png' }),
			period
		});

		if (!png) {
			await interaction.editReply({
				flags: [MessageFlags.IsComponentsV2],
				components: [notice(`${emoji('error')} 결산 카드를 만들지 못했어요. data-api 연결과 DB 설정을 확인해 주세요.`)]
			});
			return;
		}
		await interaction.editReply({ files: [new AttachmentBuilder(png, { name: 'wrapped.png' })] });
	}
}
