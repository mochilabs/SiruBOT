import { guildDataRpc } from '@sirubot/utils';
import type { GuildChannelItem, GuildMemberItem, GuildRoleItem } from '@sirubot/utils';
import type { GuildMember } from 'discord.js';
import { createRedisResponder, type RedisBinding } from '../../../lib/redisResponder.ts';

interface MemberLike {
	id: string;
	nickname: string | null;
	user: { username: string; globalName: string | null };
	displayAvatarURL(options?: { size?: number }): string;
}

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
