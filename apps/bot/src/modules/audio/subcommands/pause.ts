import { container } from '@sapphire/framework';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import * as view from '../view/pause.ts';

export const name = 'pause';
export const ko = '일시정지';
export const description = '현재 곡을 일시정지해요. 다시 들으려면 /음악 재개를 사용해 주세요.';
/** en-US 기본 설명 (기본 로케일이 영어예요) */
export const descriptionEn = 'Pause the current track. Use /music resume to continue.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub.setName(name).setNameLocalizations({ ko }).setDescription(descriptionEn).setDescriptionLocalizations({ ko: description });
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	const player = container.audio.getPlayer(interaction.guildId);
	if (!player) return;

	await interaction.deferReply();
	if (!player.paused) await player.pause();
	await interaction.editReply({ components: [view.paused()], flags: [MessageFlags.IsComponentsV2] });
}
