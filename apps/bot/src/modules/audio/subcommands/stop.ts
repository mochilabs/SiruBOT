import { container } from '@sapphire/framework';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { errorView } from '../view/error.ts';
import * as view from '../view/stop.ts';

export const name = 'stop';
export const ko = '정지';
export const description = '대기열을 정리하고 노래를 멈춰요';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub.setName(name).setNameLocalizations({ ko }).setDescription(description).setDescriptionLocalizations({ ko: description });
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	if (!interaction.member.voice.channelId) {
		await interaction.reply({
			flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
			components: [errorView('🔇 음성 채널에 먼저 접속해주세요.')]
		});
		return;
	}

	const player = container.audio.getPlayer(interaction.guildId);
	if (!player) {
		await interaction.reply({
			flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
			components: [errorView('❌ 재생 중인 곡이 없어요.')]
		});
		return;
	}

	await interaction.reply({
		components: [view.stop()],
		flags: [MessageFlags.IsComponentsV2]
	});
	player.setData('stopByCommand', true);

	await container.mixerService.clearNext(player).catch(() => null);
	await player.stopPlaying();
	await player.disconnect();
}
