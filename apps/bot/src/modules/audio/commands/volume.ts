import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction } from 'discord.js';
import * as view from '../view/volume.ts';

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

		const volume = interaction.options.getInteger('volume');
		if (volume === null) {
			const savedVolume = await this.container.guildService.getVolume(interaction.guildId);

			await interaction.editReply({ embeds: [view.currentVolume({ volume: savedVolume })] });
			return;
		}
		
		if (volume < 0 || volume > 150) {
			throw new UserError({
				identifier: 'volume_invalid',
				message: '❌  볼륨은 **0**부터 **150**까지 설정할 수 있어요.',
				context: {
					volume
				}
			});
		}

		const { volume: volumeUpdated } = await this.container.guildService.updateVolume(interaction.guildId, volume);
		const player = this.container.audio.getPlayer(interaction.guildId);
		if (player) player.setVolume(volumeUpdated);

		await interaction.editReply({ embeds: [view.volumeUpdated({ volume: volumeUpdated, isPlaying: !!player })] });

		return;
	}
}
