import { PermissionFlagsBits, type GuildMember } from 'discord.js';

/**
 * 서버 멤버의 권한·역할 판정에 필요한 최소 포트 (framework-free 타입 계약).
 * services/와 각 feature의 application 계층은 discord.js GuildMember 대신 이 모양만 받아요.
 * 진입점(슬래시·버튼·Sapphire 피스)은 memberPermissionPort()로 실제 멤버를 감싸서 넘겨요.
 */
export interface MemberPermissionPort {
	/** Administrator 권한 보유 여부 */
	isAdministrator(): boolean;
	/** 해당 역할 보유 여부 */
	hasRole(roleId: string): boolean;
}

/** discord.js 멤버를 MemberPermissionPort로 감싸요 (어댑터 — 호출 시점의 캐시를 그때그때 읽어요). */
export function memberPermissionPort(member: GuildMember): MemberPermissionPort {
	return {
		isAdministrator: () => member.permissions.has(PermissionFlagsBits.Administrator),
		hasRole: (roleId) => member.roles.cache.has(roleId)
	};
}
