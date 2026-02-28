import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import * as view from '../view/pause.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'pause',
	description: '현재 곡을 일시정지하거나 다시 재생해요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying', 'DJOrAlone']
})
export class PauseCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '일시정지' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '현재 곡을 일시정지하거나 다시 재생해요.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player) return;

		if (player.paused) {
			await player.resume();
			await interaction.reply({
				components: [view.resumed()],
				flags: [MessageFlags.IsComponentsV2]
			});
		} else {
			await player.pause();
			await interaction.reply({
				components: [view.paused()],
				flags: [MessageFlags.IsComponentsV2]
			});
		}
	}
}
