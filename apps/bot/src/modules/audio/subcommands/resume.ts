import { container, UserError } from '@sapphire/framework';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import * as view from '../view/pause.ts';
import { preconditions as pausePreconditions } from './pause.ts';

export const preconditions = pausePreconditions.filter((condition) => condition !== 'SongPlaying');
export const name = 'resume';
export const ko = '재개';
export const description = '일시정지한 곡을 이어서 재생해요.';
export const descriptionEn = 'Resume the paused track.';

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub.setName(name).setNameLocalizations({ ko }).setDescription(descriptionEn).setDescriptionLocalizations({ ko: description });
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	const player = container.audio.getPlayer(interaction.guildId);
	if (!player) return;
	await interaction.deferReply();
	if (!player.queue.current && !player.queue.tracks.length)
		throw new UserError({
			identifier: 'resume_empty',
			message: '이어 재생할 곡이 없어요. /재생으로 곡을 추가해 주세요.',
			context: { ephemeral: true }
		});
	if (player.paused) await player.resume();
	else if (!player.playing) await container.audioService.ensurePlayback(player);
	await interaction.editReply({ components: [view.resumed()], flags: [MessageFlags.IsComponentsV2] });
}
