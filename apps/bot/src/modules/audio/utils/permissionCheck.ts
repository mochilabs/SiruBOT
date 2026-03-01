import { container } from '@sapphire/framework';
import { GuildMember, PermissionFlagsBits } from 'discord.js';

/**
 * DJ 역할 보유, 관리자 권한, 또는 VC에 혼자 있을 때 true.
 * DJ 역할 미설정 시 모두 true.
 */
export async function checkDJOrAlone(guildId: string, member: GuildMember): Promise<boolean> {
	// 1. DJ 역할 설정 확인
	const djRoleId = await container.guildService.getDJRole(guildId);
	if (!djRoleId) return true; // DJ 역할 미설정 → 모두 허용

	// 2. 관리자 또는 DJ 역할 보유
	if (member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.has(djRoleId)) {
		return true;
	}

	// 3. VC에 혼자 (봇 제외)
	const voiceChannel = member.voice.channel;
	if (voiceChannel) {
		const nonBotMembers = voiceChannel.members.filter((m) => !m.user.bot);
		if (nonBotMembers.size === 1) return true;
	}

	return false;
}

/**
 * ManageGuild 권한 체크
 */
export function checkManageGuild(member: GuildMember): boolean {
	return member.permissions.has(PermissionFlagsBits.ManageGuild);
}
