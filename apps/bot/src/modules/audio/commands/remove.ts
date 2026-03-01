import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { createContainer } from '@sirubot/utils';
import { Track } from 'lavalink-client';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'remove',
	description: '대기열에서 특정 곡을 삭제해요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone']
})
export class RemoveCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '삭제' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '대기열에서 특정 곡을 삭제해요.' })
				.addIntegerOption((option) =>
					option
						.setName('position')
						.setDescription('Position of the track to remove')
						.setNameLocalizations({ ko: '위치' })
						.setDescriptionLocalizations({ ko: '삭제할 곡의 대기열 번호' })
						.setMinValue(1)
						.setRequired(true)
						.setAutocomplete(true)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player) return;

		const position = interaction.options.getInteger('position', true);
		if (position > player.queue.tracks.length) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral],
				content: '❌ 해당 번호의 곡이 대기열에 없어요.'
			});
			return;
		}

		const removed = player.queue.splice(position - 1, 1);
		if (removed.length === 0) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral],
				content: '❌ 곡을 삭제할 수 없었어요.'
			});
			return;
		}

		const track = removed[0] as Track;
		const containerComponent = createContainer();
		containerComponent.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`🗑️ **#${position}** [${track.info.title}](${track.info.uri})을(를) 대기열에서 삭제했어요.`)
		);

		await interaction.reply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	public override async autocompleteRun(interaction: import('discord.js').AutocompleteInteraction) {
		if (!interaction.inCachedGuild()) return;

		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player) return interaction.respond([]);

		const focused = interaction.options.getFocused();
		const startIndex = focused ? parseInt(focused) - 1 : 0;
		const safeStart = Math.max(0, isNaN(startIndex) ? 0 : startIndex);

		const data = player.queue.tracks.slice(safeStart, safeStart + 25).map((track, index) => ({
			name: `#${safeStart + index + 1} ${track.info.title.slice(0, 90)}`,
			value: safeStart + index + 1
		}));

		await interaction.respond(data);
	}
}
