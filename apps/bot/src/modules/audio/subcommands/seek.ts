import { container, UserError } from '@sapphire/framework';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import * as view from '../view/seek.ts';

export const name = 'seek';
export const ko = '시간이동';
export const description = '현재 곡의 특정 시간으로 이동해요.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(description)
		.setDescriptionLocalizations({ ko: description })
		.addStringOption((option) =>
			option
				.setName('time')
				.setNameLocalizations({ ko: '시간' })
				.setDescription('Time to seek to (e.g. 1:30, 90, 0:45)')
				.setDescriptionLocalizations({ ko: '이동할 시간이에요. (예: 1:30, 90, 0:45)' })
				.setRequired(true)
		);
}

/**
 * Parses time strings like "1:30", "90", "0:45", "1:02:30"
 * Returns milliseconds or null if invalid
 */
function parseTime(input: string): number | null {
	const trimmed = input.trim();

	if (trimmed.includes(':')) {
		const parts = trimmed.split(':').map(Number);
		if (parts.some(isNaN)) return null;

		if (parts.length === 2) {
			const [minutes, seconds] = parts;
			return (minutes * 60 + seconds) * 1000;
		} else if (parts.length === 3) {
			const [hours, minutes, seconds] = parts;
			return (hours * 3600 + minutes * 60 + seconds) * 1000;
		}
		return null;
	}

	const seconds = Number(trimmed);
	if (isNaN(seconds)) return null;
	return seconds * 1000;
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	const player = container.audio.getPlayer(interaction.guildId);
	const current = player?.queue.current;

	if (!player || !current) return;

	if (current.info.isStream) {
		throw new UserError({
			identifier: 'seek_live_stream',
			message: '❌ 실시간 스트리밍에서는 탐색을 사용할 수 없어요.'
		});
	}

	const timeStr = interaction.options.getString('time', true);
	const positionMs = parseTime(timeStr);

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
