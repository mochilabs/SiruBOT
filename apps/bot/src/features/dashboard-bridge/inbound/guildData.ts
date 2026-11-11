/**
 * 길드 데이터(채널·역할·멤버 목록) 응답자 — 대시보드 조회 → data-api Redis 요청 → 봇 캐시 매핑 → Redis 응답.
 *
 * 대시보드가 사용자 토큰으로 Discord API를 직접 호출하면 401이 나므로 봇 권한으로 우회해요.
 * data-api가 Redis 채널(`sirubot:guild-data:request`)로 {requestId, guildId, kind, userIds?}를
 * 브로드캐스트하면, 그 길드를 보유한 봇 프로세스만 이 응답자가 guild.channels.cache/
 * guild.roles.cache/guild.members.cache를 매핑해 `sirubot:guild-data:response` 채널로 응답해요 —
 * data-api guildDataHub가 requestId로 응답을 상관(correlation)해 대시보드에 내려줘요.
 * 수신·서명·검증·길드 확인·응답 골격은 lib/redisResponder.ts가 맡아요.
 */
import { guildDataRpc } from '@sirubot/utils';
import type { GuildChannelItem, GuildMemberItem, GuildRoleItem } from '@sirubot/utils';
import type { GuildMember } from 'discord.js';
import { createRedisResponder, type RedisBinding } from '../../../lib/redisResponder.ts';

/** mapGuildMemberToItem이 필요로 하는 최소 구조 — GuildMember 대신 구조 타입을 쓰면 유닛 테스트가 가벼워져요 */
interface MemberLike {
	id: string;
	nickname: string | null;
	user: { username: string; globalName: string | null };
	displayAvatarURL(options?: { size?: number }): string;
}

/** 멤버 표시 정보 매핑 — 서버 별명이 최우선, 그다음 전역 표시 이름, 마지막으로 계정 사용자명이에요 */
export function mapGuildMemberToItem(member: MemberLike): GuildMemberItem {
	return {
		id: member.id,
		displayName: member.nickname ?? member.user.globalName ?? member.user.username,
		username: member.user.username,
		avatarUrl: member.displayAvatarURL({ size: 64 })
	};
}

export function createGuildDataResponder(): RedisBinding {
	return createRedisResponder(guildDataRpc, async ({ guild, request }) => {
		if (request.kind === 'channels') {
			// 쓰레드 포함 전부 매핑해요 — 대시보드가 type으로 필터링해요.
			const channels: GuildChannelItem[] = [...guild.channels.cache.values()].map((channel) => ({
				id: channel.id,
				name: channel.name,
				type: channel.type,
				parentId: channel.parentId,
				position: 'position' in channel ? channel.position : 0
			}));
			return { channels };
		}

		if (request.kind === 'members') {
			// 멤버 표시 정보를 병렬로 조회해요 — 대시보드 통계 topRequesters의 아바타/별명 표시에 쓰여요.
			// 캐시에 없는 멤버는 개별 fetch하고, 이미 길드를 떠난 멤버는 조용히 건너뛰어요.
			const settled = await Promise.allSettled(
				(request.userIds ?? []).map(async (userId) => {
					const cached = guild.members.cache.get(userId);
					if (cached) return cached;
					return guild.members.fetch(userId);
				})
			);
			const members: GuildMemberItem[] = settled
				.filter((result): result is PromiseFulfilledResult<GuildMember> => result.status === 'fulfilled')
				.map((result) => mapGuildMemberToItem(result.value));
			return { members };
		}

		const roles: GuildRoleItem[] = [...guild.roles.cache.values()].map((role) => ({
			id: role.id,
			name: role.name,
			color: role.color,
			position: role.position,
			managed: role.managed
		}));
		return { roles };
	});
}
