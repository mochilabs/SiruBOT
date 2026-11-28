import { PermissionFlagsBits, type GuildMember } from 'discord.js';

export interface MemberPermissionPort {
	isAdministrator(): boolean;
	hasRole(roleId: string): boolean;
}

export function memberPermissionPort(member: GuildMember): MemberPermissionPort {
	return {
		isAdministrator: () => member.permissions.has(PermissionFlagsBits.Administrator),
		hasRole: (roleId) => member.roles.cache.has(roleId)
	};
}
