import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { createContainer } from '@sirubot/utils';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'previous',
	description: '이전에 재생한 곡을 다시 재생해요.',
	fullCategory: ['음악'],
	preconditions: ['NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'DJOrAlone']
})
export class PreviousCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '이전곡' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '이전에 재생한 곡을 다시 재생해요.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const player = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
		if (!player) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral],
				content: '❌ 현재 재생 중인 플레이어가 없어요.'
			});
			return;
		}

		if (player.queue.previous.length === 0) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral],
				content: '❌ 이전에 재생한 곡이 없어요.'
			});
			return;
		}

		const previousTrack = player.queue.previous[player.queue.previous.length - 1];
		if (player.queue.current) {
			player.queue.tracks.unshift(player.queue.current);
		}
		await player.play({ clientTrack: previousTrack });
		player.queue.previous.pop();

		const containerComponent = createContainer();
		containerComponent.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`⏮️ 이전곡 **${previousTrack.info.title}**을(를) 다시 재생해요.`)
		);

		await interaction.reply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
