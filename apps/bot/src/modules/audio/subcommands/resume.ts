import { container } from '@sapphire/framework';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import * as view from '../view/pause.ts';
import { actorFromMember } from '../../../features/music/application/actor.ts';
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
	await interaction.deferReply();
	// 인가·재생할 곡 확인·재개는 유스케이스가 맡아요.
	await container.music.resume(actorFromMember(interaction.member));
	await interaction.editReply({ components: [view.resumed()], flags: [MessageFlags.IsComponentsV2] });
}
