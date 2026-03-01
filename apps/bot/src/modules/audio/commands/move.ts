import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { createContainer } from '@sirubot/utils';
import { errorView } from '../view/error.ts';
import { Track } from 'lavalink-client';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'move',
	description: '대기열에서 곡의 위치를 변경해요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone']
})
export class MoveCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '이동' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '대기열에서 곡의 위치를 변경해요.' })
				.addIntegerOption((option) =>
					option
						.setName('from')
						.setDescription('Current position of the track')
						.setNameLocalizations({ ko: '현재위치' })
						.setDescriptionLocalizations({ ko: '이동할 곡의 현재 번호' })
						.setMinValue(1)
						.setRequired(true)
						.setAutocomplete(true)
				)
				.addIntegerOption((option) =>
					option
						.setName('to')
						.setDescription('New position for the track')
						.setNameLocalizations({ ko: '목표위치' })
						.setDescriptionLocalizations({ ko: '곡을 이동할 목표 번호' })
						.setMinValue(1)
						.setRequired(true)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player) return;

		const from = interaction.options.getInteger('from', true);
		const to = interaction.options.getInteger('to', true);
		const queueLength = player.queue.tracks.length;

		if (from > queueLength || to > queueLength) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`❌ 대기열 범위를 벗어났어요. 현재 대기열: ${queueLength}곡`)]
			});
			return;
		}

		if (from === to) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('❌ 같은 위치로는 이동할 수 없어요.')]
			});
			return;
		}

		// Remove from old position and insert at new position
		const [track] = player.queue.splice(from - 1, 1);
		if (!track) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('❌ 곡을 이동할 수 없었어요.')]
			});
			return;
		}

		player.queue.splice(to - 1, 0, track as Track);

		const containerComponent = createContainer();
		containerComponent.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`↕️ **${(track as Track).info.title}**을(를) **#${from}** → **#${to}** 위치로 이동했어요.`)
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
