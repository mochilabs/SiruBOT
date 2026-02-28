import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import * as view from '../view/seek.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'seek',
	description: '현재 곡의 특정 시간으로 이동해요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone']
})
export class SeekCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '탐색' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '현재 곡의 특정 시간으로 이동해요.' })
				.addStringOption((option) =>
					option
						.setName('time')
						.setNameLocalizations({ ko: '시간' })
						.setDescription('Time to seek to (e.g. 1:30, 90, 0:45)')
						.setDescriptionLocalizations({ ko: '이동할 시간이에요. (예: 1:30, 90, 0:45)' })
						.setRequired(true)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const player = this.container.audio.getPlayer(interaction.guildId);
		const current = player?.queue.current;

		if (!player || !current) return;

		if (current.info.isStream) {
			throw new UserError({
				identifier: 'seek_live_stream',
				message: '❌ 실시간 스트리밍에서는 탐색을 사용할 수 없어요.'
			});
		}

		const timeStr = interaction.options.getString('time', true);
		const positionMs = this.parseTime(timeStr);

		if (positionMs === null || positionMs < 0) {
			throw new UserError({
				identifier: 'seek_invalid_time',
				message: '❌ 올바른 시간 형식이 아니에요. (예: `1:30`, `90`, `0:45`)'
			});
		}

		if (positionMs > current.info.duration) {
			throw new UserError({
				identifier: 'seek_out_of_range',
				message: '❌ 곡의 길이를 초과하는 시간이에요.'
			});
		}

		await player.seek(positionMs);

		await interaction.reply({
			components: [view.seekSuccess({ position: positionMs })],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	/**
	 * Parses time strings like "1:30", "90", "0:45", "1:02:30"
	 * Returns milliseconds or null if invalid
	 */
	private parseTime(input: string): number | null {
		const trimmed = input.trim();

		// Format: MM:SS or HH:MM:SS
		if (trimmed.includes(':')) {
			const parts = trimmed.split(':').map(Number);
			if (parts.some(isNaN)) return null;

			if (parts.length === 2) {
				// MM:SS
				const [minutes, seconds] = parts;
				return (minutes * 60 + seconds) * 1000;
			} else if (parts.length === 3) {
				// HH:MM:SS
				const [hours, minutes, seconds] = parts;
				return (hours * 3600 + minutes * 60 + seconds) * 1000;
			}
			return null;
		}

		// Format: plain seconds
		const seconds = Number(trimmed);
		if (isNaN(seconds)) return null;
		return seconds * 1000;
	}
}
