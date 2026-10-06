import { container } from '@sapphire/framework';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import * as view from '../view/pause.ts';

export const name = 'pause';
export const ko = '일시정지';
export const description = '현재 곡을 일시정지하거나 다시 재생해요.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub.setName(name).setNameLocalizations({ ko }).setDescription(description).setDescriptionLocalizations({ ko: description });
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	const player = container.audio.getPlayer(interaction.guildId);
	if (!player) return;

	if (player.paused) {
		await player.resume();
		await interaction.reply({
			components: [view.resumed()],
			flags: [MessageFlags.IsComponentsV2]
		});
	} else {
		await player.pause();
		await interaction.reply({
			components: [view.paused()],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
