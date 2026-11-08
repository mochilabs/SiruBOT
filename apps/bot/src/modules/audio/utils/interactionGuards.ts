import { emoji } from '@sirubot/utils';
import { MessageFlags, PermissionFlagsBits, type ButtonInteraction, type GuildMember, type StringSelectMenuInteraction } from 'discord.js';
import { errorView } from '../../../lib/errorView.ts';
import { checkDJOrAlone } from './permissionCheck.ts';
import type { CustomPlayer } from '../lavalink/player/customPlayer.ts';

type ControllerInteraction = ButtonInteraction<'cached'> | StringSelectMenuInteraction<'cached'>;

/** 컨트롤러·필터 핸들러가 공유하는 거절 문구 — 문구와 이모지를 한 곳에서 관리해요. */
export const GUARD_MESSAGES = {
	notInSameVoice: '봇과 같은 음성 채널에 있어야 사용할 수 있어요.',
	djOnlyControl: '이 컨트롤은 DJ 역할이 있거나 채널에 혼자 있을 때만 사용할 수 있어요.',
	djOnlyFilter: '필터 변경은 DJ 역할이 있거나 채널에 혼자 있을 때만 가능해요.',
	noPlayer: '현재 재생 중인 플레이어가 없어요.'
} as const;

/** 본인에게만 보이는 거절 응답을 보내요. */
export async function replyGuardError(interaction: ControllerInteraction, message: string): Promise<void> {
	await interaction.reply({
		flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
		components: [errorView(`${emoji('error')} ${message}`)]
	});
}

/** 관리자는 음성 채널 밖에서도 허용, 일반 유저는 봇과 같은 음성 채널이어야 해요. */
export function isInBotVoice(member: GuildMember, botVoiceChannelId: string | null): boolean {
	if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
	const memberVoiceChannelId = member.voice.channelId;
	return Boolean(memberVoiceChannelId) && (botVoiceChannelId === null || memberVoiceChannelId === botVoiceChannelId);
}

/**
 * 음성 채널 → DJ → 플레이어 존재 순으로 검사해요. 거절하면 이미 응답했으니 `null`을 돌려줘요.
 * `djMessage`가 없으면 DJ 검사를 건너뛰어요.
 */
export async function guardPlayerAccess(
	interaction: ControllerInteraction,
	player: CustomPlayer | undefined,
	djMessage?: string
): Promise<CustomPlayer | null> {
	const botVoiceChannelId = interaction.guild.members.me?.voice.channelId ?? player?.voiceChannelId ?? null;
	if (!isInBotVoice(interaction.member, botVoiceChannelId)) {
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
