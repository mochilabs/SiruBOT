import { container } from '@sapphire/framework';
import { GuildMember, PermissionFlagsBits } from 'discord.js';
import * as guildPlayback from '../../../services/guildSettings/playback.ts';
import { actorFromMember } from '../../../features/music/application/actor.ts';
import { isDjOrAlone } from '../../../features/music/application/access.ts';

/**
 * DJ 역할 보유, 관리자 권한, 또는 VC에 혼자 있을 때 true.
 * DJ 역할 미설정 시 모두 true.
 */
export async function checkDJOrAlone(guildId: string, member: GuildMember): Promise<boolean> {
	const djRoleId = await guildPlayback.getDJRole(container.guildService, guildId);
	return isDjOrAlone(actorFromMember(member), djRoleId);
}

/**
 * ManageGuild 권한 체크
 */
export function checkManageGuild(member: GuildMember): boolean {
	return member.permissions.has(PermissionFlagsBits.ManageGuild);
}
