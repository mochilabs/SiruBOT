import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { createContainer } from '@sirubot/utils';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'shuffle',
	description: '대기열을 랜덤으로 섞어요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone']
})
export class ShuffleCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '셔플' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '대기열을 랜덤으로 섞어요.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player) return;

		const queueLength = player.queue.tracks.length;
		if (queueLength < 2) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral],
				content: '🔀 대기열에 곡이 2개 이상이어야 셔플할 수 있어요.'
			});
			return;
		}

		await player.queue.shuffle();

		const containerComponent = createContainer();
		containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(`🔀 대기열 **${queueLength}곡**을 셔플했어요.`));

		await interaction.reply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
