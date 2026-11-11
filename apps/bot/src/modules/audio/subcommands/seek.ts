import { container } from '@sapphire/framework';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { parseTimeToMs } from '../utils/timeParse.ts';
import * as view from '../view/seek.ts';
import { actorFromMember } from '../../../features/music/application/actor.ts';

export const name = 'seek';
export const ko = '시간이동';
export const description = '현재 곡의 특정 시간으로 이동해요.';
/** en-US 기본 설명 (기본 로케일이 영어예요) */
export const descriptionEn = 'Jump to a specific time in the current track.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(descriptionEn)
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

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	// 파싱에 실패하면 NaN으로 넘겨요 — 유스케이스가 스트림·형식·범위 검증을 같은 문구로 거절해요.
	const positionMs = parseTimeToMs(interaction.options.getString('time', true)) ?? Number.NaN;
	const { positionMs: seeked } = await container.music.seek(actorFromMember(interaction.member), positionMs);

	await interaction.reply({
		components: [view.seekSuccess({ position: seeked })],
		flags: [MessageFlags.IsComponentsV2]
	});
}
