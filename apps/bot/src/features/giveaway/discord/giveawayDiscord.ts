import { ChannelType, type Client, PermissionFlagsBits } from 'discord.js';
import type { GiveawayMemberFacts } from '@sirubot/utils/giveaway';
import type { AppLogger } from '../../../lib/appLogger.ts';
import type { GiveawayDiscordPort } from '../application/giveawayService.ts';
import { giveawayAnnouncement, giveawayCardMessage } from './views/giveawayViews.ts';

export interface GiveawayDiscordDeps {
	getClient: () => Client;
	logger: AppLogger;
}

const SENDABLE_TYPES = new Set<ChannelType>([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
/** 멤버 조회 한 번에 요청하는 사용자 수 (게이트웨이 요청 상한) */
const MEMBER_FETCH_CHUNK = 100;

const isUnknown = (error: unknown) =>
	typeof error === 'object' && error !== null && 'code' in error && (error.code === 10003 || error.code === 10008);

/** 나눔 서비스의 Discord 어댑터 — 카드 게시·수정, 발표, 멤버 조회를 맡아요 */
export function createGiveawayDiscord(deps: GiveawayDiscordDeps): GiveawayDiscordPort {
	const getChannel = async (channelId: string) => {
		const client = deps.getClient();
		return client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId).catch(() => null));
	};

	return {
		async checkChannel(guildId, channelId) {
			const channel = await getChannel(channelId);
			if (!channel || channel.isDMBased()) return '채널을 찾을 수 없어요. 지워졌거나 봇이 볼 수 없는 채널이에요.';
			if (channel.guildId !== guildId) return '이 서버의 채널이 아니에요.';
			if (!SENDABLE_TYPES.has(channel.type)) return '메시지를 보낼 수 있는 텍스트·공지 채널이 아니에요.';
			const me = channel.guild.members.me ?? (await channel.guild.members.fetchMe().catch(() => null));
			const permissions = me ? channel.permissionsFor(me) : null;
			if (!permissions?.has(PermissionFlagsBits.ViewChannel)) return '봇이 이 채널을 볼 수 없어요. 채널 보기 권한이 필요해요.';
			if (!permissions.has(PermissionFlagsBits.SendMessages)) return '봇이 이 채널에 메시지를 보낼 수 없어요. 메시지 보내기 권한이 필요해요.';
			return null;
		},

		async publish(channelId, card) {
			const channel = await getChannel(channelId);
			if (!channel || channel.isDMBased() || !channel.isSendable()) throw new Error('채널을 찾을 수 없어요.');
			const message = await channel.send(giveawayCardMessage(card));
			return message.id;
		},

		async updateCard(channelId, messageId, card) {
			try {
				const channel = await getChannel(channelId);
				if (!channel || channel.isDMBased() || !channel.isTextBased()) return 'gone';
				const message = await channel.messages.fetch(messageId);
				await message.edit(giveawayCardMessage(card));
				return 'ok';
			} catch (error) {
				if (isUnknown(error)) return 'gone';
				deps.logger.warn(`[giveaway] 카드 수정 실패 (${channelId}/${messageId}): ${error instanceof Error ? error.message : String(error)}`);
				return 'failed';
			}
		},

		async announce(channelId, messageId, card, kind, newWinnerIds) {
			const channel = await getChannel(channelId);
			if (!channel || channel.isDMBased() || !channel.isSendable()) return 'gone';
			await channel.send({
				content: giveawayAnnouncement(card, kind, newWinnerIds),
				// 당첨자에게만 알림이 가요
				allowedMentions: { users: [...newWinnerIds] },
				...(messageId ? { reply: { messageReference: messageId, failIfNotExists: false } } : {})
			});
			return 'ok';
		},

		async fetchMembers(guildId, userIds) {
			const guild = deps.getClient().guilds.cache.get(guildId);
			const result = new Map<string, GiveawayMemberFacts>();
			if (!guild) return result;
			const missing: string[] = [];
			for (const id of userIds) if (!guild.members.cache.has(id)) missing.push(id);
			for (let i = 0; i < missing.length; i += MEMBER_FETCH_CHUNK) {
				await guild.members.fetch({ user: missing.slice(i, i + MEMBER_FETCH_CHUNK) });
			}
			for (const id of userIds) {
				const member = guild.members.cache.get(id);
				if (!member) continue;
				result.set(id, {
					roleIds: [...member.roles.cache.keys()],
					joinedAt: member.joinedAt,
					accountCreatedAt: member.user.createdAt
				});
			}
			return result;
		}
	};
}
