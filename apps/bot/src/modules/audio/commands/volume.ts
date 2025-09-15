import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { DEFAULT_COLOR, ExtendedEmbedBuilder, volumeToEmoji } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'volume',
	description: 'Set the volume of the player.'
})
export class VolumeCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setDescription(this.description)
				.setNameLocalizations({
					ko: '볼륨'
				})
				.setDescriptionLocalizations({
					ko: '플레이어의 볼륨을 설정해요.'
				})
				.addIntegerOption((option) =>
					option
						.setName('volume')
						.setNameLocalizations({
							ko: '볼륨'
						})
						.setDescription('Set the volume of the player.')
						.setDescriptionLocalizations({
							ko: '설정할 볼륨을 입력해주세요.'
						})
						.setMinValue(0)
						.setMaxValue(150)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		await interaction.deferReply();

		const volume = interaction.options.getInteger('volume', true);

		const queryRes = await this.container.db.guildSettings.upsert({
			where: {
				id: interaction.guildId
			},
			update: {
				volume: volume
			},
			create: {
				id: interaction.guildId,
				volume: volume
			}
		});

		const player = this.container.audio.getPlayer(interaction.guildId);

		const volumeEmbed = new EmbedBuilder()
			.setDescription(`${volumeToEmoji(queryRes.volume)} ${player ? '현재 ' : ''}볼륨을 **${queryRes.volume}%** 로 설정했어요.`)
			.setColor(DEFAULT_COLOR);

		if (player) {
			player.setVolume(queryRes.volume);
		} else {
			volumeEmbed.setFooter({ text: '✨  설정된 볼륨은 다음 재생 시 적용돼요.' });
		}

		await interaction.editReply({ embeds: [volumeEmbed] });

		return;
	}
}
