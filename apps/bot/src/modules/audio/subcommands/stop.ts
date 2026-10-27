import { container } from '@sapphire/framework';
import { emoji, VOICE_CHANNEL_REQUIRED_MESSAGE } from '@sirubot/utils';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { errorView } from '../../../lib/errorView.ts';
import * as view from '../view/stop.ts';

export const name = 'stop';
export const ko = '정지';
export const description = '대기열을 정리하고 노래를 멈춰요.';
/** en-US 기본 설명 (기본 로케일이 영어예요) */
export const descriptionEn = 'Clear the queue and stop playing.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub.setName(name).setNameLocalizations({ ko }).setDescription(descriptionEn).setDescriptionLocalizations({ ko: description });
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	if (!interaction.member.voice.channelId) {
		await interaction.reply({
			flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
			components: [errorView(`${emoji('volume_muted')} ${VOICE_CHANNEL_REQUIRED_MESSAGE}`)]
		});
		return;
	}

	const player = container.audio.getPlayer(interaction.guildId);
	if (!player) {
		await interaction.reply({
			flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
			components: [errorView(`${emoji('error')} 재생 중인 곡이 없어요.`)]
		});
		return;
	}

	await interaction.reply({
		components: [view.stop()],
		flags: [MessageFlags.IsComponentsV2]
	});

	await container.audioService.stopPlayback(player);
}
