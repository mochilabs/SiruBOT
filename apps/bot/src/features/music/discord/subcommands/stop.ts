import { container } from '@sapphire/framework';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import * as view from '../views/stop.ts';
import { actorFromMember } from '../../application/actor.ts';

export const name = 'stop';
export const ko = '정지';
export const description = '대기열을 정리하고 노래를 멈춰요.';
export const descriptionEn = 'Clear the queue and stop playing.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub.setName(name).setNameLocalizations({ ko }).setDescription(descriptionEn).setDescriptionLocalizations({ ko: description });
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	await interaction.deferReply();
	await container.music.stop(actorFromMember(interaction.member));
	await interaction.editReply({
		components: [view.stop()],
		flags: [MessageFlags.IsComponentsV2]
	});
}
