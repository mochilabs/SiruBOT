import { container } from '@sapphire/framework';
import { GuildMember, PermissionFlagsBits } from 'discord.js';
import * as guildPlayback from '../../../../services/guildSettings/playback.ts';
import { actorFromMember } from '../../application/actor.ts';
import { hasRemoteControl, isDjOrAlone, isInBotVoice } from '../../application/access.ts';

export async function checkDJOrAlone(guildId: string, member: GuildMember): Promise<boolean> {
	const djRoleId = await guildPlayback.getDJRole(container.guildService, guildId);
	return isDjOrAlone(actorFromMember(member), djRoleId);
}

export async function checkRemoteControl(guildId: string, member: GuildMember): Promise<boolean> {
	const djRoleId = await guildPlayback.getDJRole(container.guildService, guildId);
	return hasRemoteControl(actorFromMember(member), djRoleId);
}

export async function checkInBotVoice(guildId: string, member: GuildMember, botVoiceChannelId: string | null): Promise<boolean> {
	const djRoleId = await guildPlayback.getDJRole(container.guildService, guildId);
	return isInBotVoice(actorFromMember(member), botVoiceChannelId, djRoleId);
}

export function checkManageGuild(member: GuildMember): boolean {
	return member.permissions.has(PermissionFlagsBits.ManageGuild);
}
