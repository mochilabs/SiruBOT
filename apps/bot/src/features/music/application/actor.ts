import { PermissionFlagsBits } from 'discord.js';

export interface Actor {
	guildId: string;
	userId: string;
	voiceChannelId: string | null;
	isAdministrator: boolean;
	canManageGuild: boolean;
	roleIds: ReadonlySet<string>;
	humansInVoiceChannel: number;
}

export interface ActorMemberSource {
	id: string;
	guild: { id: string };
	voice: {
		channelId: string | null;
		channel: { members: { filter(predicate: (member: { user: { bot: boolean } }) => boolean): { size: number } } } | null;
	};
	permissions: { has(permission: bigint): boolean };
	roles: { cache: { keys(): Iterable<string> } };
}

export function actorFromMember(member: ActorMemberSource): Actor {
	const voiceChannel = member.voice.channel;
	return {
		guildId: member.guild.id,
		userId: member.id,
		voiceChannelId: member.voice.channelId,
		isAdministrator: member.permissions.has(PermissionFlagsBits.Administrator),
		canManageGuild: member.permissions.has(PermissionFlagsBits.ManageGuild),
		roleIds: new Set(member.roles.cache.keys()),
		humansInVoiceChannel: voiceChannel ? voiceChannel.members.filter((voiceMember) => !voiceMember.user.bot).size : 0
	};
}
