import { PermissionFlagsBits, type Guild, type GuildMember } from 'discord.js';
import { emoji } from '@sirubot/utils';
import type { CustomCommandGuildContext, CustomCommandMemberContext, CustomCommandRunResult } from './interpreter.ts';

/**
 * 커스텀 명령어 실행 컨텍스트 어댑터 — 접두사·슬래시 진입점이 같은 member/guild 조립 규칙과
 * 실패 안내문을 공유하게 해요. 권한 비트는 진입점이 가진 값(채널 기준/인터랙션 기준)을 그대로 넘겨요.
 */
export function buildCustomCommandMemberContext(member: GuildMember, permissions: bigint): CustomCommandMemberContext {
	return {
		id: member.id,
		permissions,
		hasRole: (roleId) => member.roles.cache.has(roleId),
		addRole: (roleId) => member.roles.add(roleId),
		removeRole: (roleId) => member.roles.remove(roleId)
	};
}

export function buildCustomCommandGuildContext(guild: Guild, me: GuildMember | null): CustomCommandGuildContext {
	return {
		botTopRolePosition: me?.roles.highest.position ?? 0,
		botCanManageRoles: me?.permissions.has(PermissionFlagsBits.ManageRoles) ?? false,
		getRole: (roleId) => {
			const role = guild.roles.cache.get(roleId);
			return role ? { id: role.id, position: role.position, managed: role.managed } : null;
		}
	};
}

/** 실행 결과별 안내문 — 명령어 표기는 진입점이 넘기고(접두사 `!이름` / 슬래시 `/이름`), 문구는 여기서만 정해요 ('ok'는 null) */
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
