import { emoji } from '@sirubot/utils';
import { MessageFlags, type ButtonInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { errorView } from '../../../../lib/errorView.ts';
import { checkDJOrAlone, checkInBotVoice } from './permissionCheck.ts';
import type { CustomPlayer } from '../../lavalink/player/customPlayer.ts';

type ControllerInteraction = ButtonInteraction<'cached'> | StringSelectMenuInteraction<'cached'>;

export const GUARD_MESSAGES = {
	notInSameVoice: '봇과 같은 음성 채널에 있어야 사용할 수 있어요.',
	djOnlyControl: '이 컨트롤은 DJ 역할이 있거나 채널에 혼자 있을 때만 사용할 수 있어요.',
	djOnlyFilter: '필터 변경은 DJ 역할이 있거나 채널에 혼자 있을 때만 가능해요.',
	noPlayer: '현재 재생 중인 플레이어가 없어요.'
} as const;

export async function replyGuardError(interaction: ControllerInteraction, message: string): Promise<void> {
	await interaction.reply({
		flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
		components: [errorView(`${emoji('error')} ${message}`)]
	});
}

export async function guardPlayerAccess(
	interaction: ControllerInteraction,
	player: CustomPlayer | undefined,
	djMessage?: string
): Promise<CustomPlayer | null> {
	const botVoiceChannelId = interaction.guild.members.me?.voice.channelId ?? player?.voiceChannelId ?? null;
	if (!(await checkInBotVoice(interaction.guildId, interaction.member, botVoiceChannelId))) {
		await replyGuardError(interaction, GUARD_MESSAGES.notInSameVoice);
		return null;
	}
	if (djMessage && !(await checkDJOrAlone(interaction.guildId, interaction.member))) {
		await replyGuardError(interaction, djMessage);
		return null;
	}
	if (!player) {
		await replyGuardError(interaction, GUARD_MESSAGES.noPlayer);
		return null;
	}
	return player;
}
