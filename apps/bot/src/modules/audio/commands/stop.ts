import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import * as view from '../view/stop.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'stop',
	description: 'Clear the queue and stop the song',
	preconditions: ['NodeAvailable', 'SongPlaying']
})
export class StopCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({
					ko: '정지'
				})
				.setDescription(this.description)
				.setDescriptionLocalizations({
					ko: '대기열을 정리하고 노래를 멈춰요'
				});
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;
		if (!interaction.member.voice.channelId) return;

		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player) return;

		await interaction.reply({
			components: [view.stop()],
			flags: [MessageFlags.IsComponentsV2]
		});

		await player.stopPlaying();
		await player.disconnect();
	}
}
