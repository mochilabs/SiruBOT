import { container } from '@sapphire/framework';
import { GuildMember, PermissionFlagsBits } from 'discord.js';
import * as guildPlayback from '../../../services/guildSettings/playback.ts';
import { actorFromMember } from '../../../features/music/application/actor.ts';
import { hasRemoteControl, isDjOrAlone, isInBotVoice } from '../../../features/music/application/access.ts';

/**
 * DJ 역할 보유, 관리자·서버 관리 권한, 또는 VC에 혼자 있을 때 true.
 * DJ 역할 미설정 시 모두 true.
 */
export async function checkDJOrAlone(guildId: string, member: GuildMember): Promise<boolean> {
	const djRoleId = await guildPlayback.getDJRole(container.guildService, guildId);
	return isDjOrAlone(actorFromMember(member), djRoleId);
}

/** 원격 권한자(Administrator·서버 관리·DJ 역할)인지 봐요 — 음성 채널 밖에서도 음악을 제어할 수 있어요. */
export async function checkRemoteControl(guildId: string, member: GuildMember): Promise<boolean> {
	const djRoleId = await guildPlayback.getDJRole(container.guildService, guildId);
	return hasRemoteControl(actorFromMember(member), djRoleId);
}

/** 제어의 음성 채널 조건 — 봇과 같은 음성 채널이거나 원격 권한자면 true예요. (판정은 음악 제어 인가 정책과 같은 구현을 써요.) */
export async function checkInBotVoice(guildId: string, member: GuildMember, botVoiceChannelId: string | null): Promise<boolean> {
	const djRoleId = await guildPlayback.getDJRole(container.guildService, guildId);
	return isInBotVoice(actorFromMember(member), botVoiceChannelId, djRoleId);
}

/**
 * ManageGuild 권한 체크
 */
export function checkManageGuild(member: GuildMember): boolean {
	return member.permissions.has(PermissionFlagsBits.ManageGuild);
}
