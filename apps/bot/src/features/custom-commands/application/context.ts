import { PermissionFlagsBits } from 'discord.js';
import { emoji } from '@sirubot/utils';
import type { CustomCommandGuildContext, CustomCommandMemberContext, CustomCommandRunResult } from './interpreter.ts';

export interface CustomCommandMemberSource {
	id: string;
	roles: {
		cache: { has(roleId: string): boolean };
		add(roleId: string): Promise<unknown>;
		remove(roleId: string): Promise<unknown>;
	};
}

export interface CustomCommandBotMemberSource {
	roles: { highest: { position: number } };
	permissions: { has(permission: bigint): boolean };
}

export interface CustomCommandGuildSource {
	roles: { cache: { get(roleId: string): { id: string; position: number; managed: boolean } | undefined } };
}

export function buildCustomCommandMemberContext(member: CustomCommandMemberSource, permissions: bigint): CustomCommandMemberContext {
	return {
		id: member.id,
		permissions,
		hasRole: (roleId) => member.roles.cache.has(roleId),
		addRole: (roleId) => member.roles.add(roleId),
		removeRole: (roleId) => member.roles.remove(roleId)
	};
}

export function buildCustomCommandGuildContext(guild: CustomCommandGuildSource, me: CustomCommandBotMemberSource | null): CustomCommandGuildContext {
	return {
		botTopRolePosition: me?.roles.highest.position ?? 0,
		botCanManageRoles: me?.permissions.has(PermissionFlagsBits.ManageRoles) ?? false,
		getRole: (roleId) => {
			const role = guild.roles.cache.get(roleId);
			return role ? { id: role.id, position: role.position, managed: role.managed } : null;
		}
	};
}

export function customCommandNotice(result: CustomCommandRunResult, commandLabel: string): string | null {
	switch (result.kind) {
		case 'invalid_spec':
			return `-# ${emoji('error')} ${commandLabel} 명령어 정의가 올바르지 않아요. 서버 관리자가 대시보드에서 다시 저장해 주세요.`;
		case 'access_denied':
			return `-# ${emoji('error')} 이 명령어를 실행할 권한이 없어요.`;
		case 'action_failed':
			return `-# ${emoji('error')} 명령어 실행에 실패했어요: ${result.reason}`;
		case 'ok':
			return null;
	}
}
