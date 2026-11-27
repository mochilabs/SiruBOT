import { ChannelType, type Client, type MessageCreateOptions, PermissionFlagsBits } from 'discord.js';
import type { AppLogger } from '../../../lib/appLogger.ts';
import type { ChannelProblem, ScheduledMessageDiscordPort } from '../application/scheduledMessageService.ts';

export interface ScheduledMessageDiscordDeps {
	getClient: () => Client;
	logger: AppLogger;
}

// @everyone/@here는 parse에서 제외해 이중으로 차단해요
export function scheduledMessageSendOptions(content: string): MessageCreateOptions {
	return { content, allowedMentions: { parse: ['users', 'roles'] } };
}

const SENDABLE_TYPES = new Set<ChannelType>([ChannelType.GuildText, ChannelType.GuildAnnouncement]);

export function createScheduledMessageDiscord(deps: ScheduledMessageDiscordDeps): ScheduledMessageDiscordPort {
	const getChannel = async (channelId: string) => {
		const client = deps.getClient();
		return client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId).catch(() => null));
	};

	return {
		async checkChannel(guildId, channelId): Promise<ChannelProblem | null> {
			const channel = await getChannel(channelId);
			if (!channel || channel.isDMBased()) return 'missing';
			if (channel.guildId !== guildId) return 'wrong-guild';
			if (!SENDABLE_TYPES.has(channel.type)) return 'not-text';
			const me = channel.guild.members.me ?? (await channel.guild.members.fetchMe().catch(() => null));
			const permissions = me ? channel.permissionsFor(me) : null;
			if (!permissions?.has(PermissionFlagsBits.ViewChannel)) return 'no-view';
			if (!permissions.has(PermissionFlagsBits.SendMessages)) return 'no-send';
			return null;
		},

		async send(channelId, content) {
			const channel = await getChannel(channelId);
			if (!channel || channel.isDMBased() || !channel.isSendable()) throw new Error('채널을 찾을 수 없어요.');
			await channel.send(scheduledMessageSendOptions(content));
		},

		async notifyCreator(userId, guildId, text) {
			try {
				const client = deps.getClient();
				const user = await client.users.fetch(userId);
				const guildName = client.guilds.cache.get(guildId)?.name ?? guildId;
				await user.send({ content: `**${guildName}**\n${text}`, allowedMentions: { parse: [] } });
				return true;
			} catch (error) {
				deps.logger.debug(`[scheduled-message] 만든 사람 DM 실패 (user ${userId}): ${error}`);
				return false;
			}
		}
	};
}
