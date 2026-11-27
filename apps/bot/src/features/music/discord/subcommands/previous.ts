import { container } from '@sapphire/framework';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { previousReplayed } from '../views/previous.ts';
import { actorFromMember } from '../../application/actor.ts';

export const name = 'previous';
export const ko = '이전곡';
export const description = '이전에 재생한 곡을 다시 재생해요.';
export const descriptionEn = 'Play the previous track again.';
export const preconditions = ['NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub.setName(name).setNameLocalizations({ ko }).setDescription(descriptionEn).setDescriptionLocalizations({ ko: description });
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	await interaction.deferReply();
	const { track } = await container.music.previous(actorFromMember(interaction.member));

	await interaction.editReply({
		components: [previousReplayed(track.info.title ?? '알 수 없는 곡')],
		flags: [MessageFlags.IsComponentsV2]
	});
}
