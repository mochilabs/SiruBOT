import { type Client, type GuildBasedChannel, type Message, MessageFlags, type MessageCreateOptions, type TextBasedChannel } from 'discord.js';
import { rolePanelEmojiKey } from '@sirubot/utils/rolePanel';
import type { AppLogger } from '../../../lib/appLogger.ts';
import type { StarboardDiscordPort, StarboardMessageRef, StarboardSource } from '../application/starboardService.ts';
import { inGuildTheme } from '../../../lib/guildThemeScope.ts';
import { starboardCard } from './views/starboardCard.ts';

const REACTOR_FETCH_LIMIT = 100;

export interface StarboardDiscordDeps {
	getClient: () => Client;
	logger: AppLogger;
}

const sendOptions: Pick<MessageCreateOptions, 'flags' | 'allowedMentions'> = {
	flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
	allowedMentions: { parse: [] }
};

export function createStarboardDiscord(deps: StarboardDiscordDeps): StarboardDiscordPort {
	const getTextChannel = async (channelId: string): Promise<(GuildBasedChannel & TextBasedChannel) | null> => {
		const client = deps.getClient();
		const channel = client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId).catch(() => null));
		if (!channel || channel.isDMBased() || !channel.isTextBased()) return null;
		return channel as GuildBasedChannel & TextBasedChannel;
	};

	const firstImage = (message: Message): string | null => {
		const attachment = message.attachments.find((item) => !item.spoiler && (item.contentType?.startsWith('image/') ?? false));
		if (attachment) return attachment.url;
		for (const embed of message.embeds) {
			const url = embed.image?.url ?? embed.thumbnail?.url;
			if (url) return url;
		}
		return null;
	};

	return {
		async fetchSource(ref: StarboardMessageRef, emoji: string, options): Promise<StarboardSource | null> {
			try {
				const channel = await getTextChannel(ref.channelId);
				if (!channel) return null;
				// 반응 수가 정확하도록 캐시를 쓰지 않고 새로 읽어요
				const message = await channel.messages.fetch({ message: ref.messageId, force: true }).catch(() => null);
				if (!message) return null;

				const key = rolePanelEmojiKey(emoji);
				const reaction = message.reactions.cache.find(
					(item) => rolePanelEmojiKey(item.emoji.id ? `<:x_x:${item.emoji.id}>` : (item.emoji.name ?? '')) === key
				);
				let authorReacted = false;
				if (reaction && options.needAuthorStarred) {
					const users = await reaction.users.fetch({ limit: REACTOR_FETCH_LIMIT }).catch(() => null);
					authorReacted = users?.has(message.author.id) ?? false;
				}

				const parent = channel.isThread() ? channel.parent : null;
				const nsfwHolder = parent ?? channel;
				return {
					guildId: ref.guildId,
					channelId: ref.channelId,
					messageId: ref.messageId,
					parentChannelId: channel.isThread() ? channel.parentId : null,
					channelNsfw: 'nsfw' in nsfwHolder ? Boolean(nsfwHolder.nsfw) : false,
					authorId: message.author.id,
					authorIsBot: message.author.bot,
					isSystem: message.system,
					authorName: message.member?.displayName ?? message.author.displayName,
					authorAvatarUrl: (message.member ?? message.author).displayAvatarURL({ size: 128, extension: 'png' }),
					content: message.content,
					firstImageUrl: firstImage(message),
					jumpUrl: message.url,
					reactionCount: reaction?.count ?? 0,
					authorReacted
				};
			} catch (error) {
				deps.logger.warn(
					`[starboard] 원문 조회 실패 (${ref.channelId}/${ref.messageId}): ${error instanceof Error ? error.message : String(error)}`
				);
				return null;
			}
		},

		async publish(channelId, source, count, emoji) {
			try {
				const channel = await getTextChannel(channelId);
				if (!channel || !channel.isSendable()) return null;
				const sent = await channel.send({
					components: [await inGuildTheme(source.guildId, () => starboardCard(source, count, emoji))],
					...sendOptions
				});
				return sent.id;
			} catch (error) {
				deps.logger.warn(`[starboard] 스타보드 글 게시 실패 (${channelId}): ${error instanceof Error ? error.message : String(error)}`);
				return null;
			}
		},

		async update(channelId, messageId, source, count, emoji) {
			try {
				const channel = await getTextChannel(channelId);
				if (!channel) return 'gone';
				await channel.messages.edit(messageId, {
					components: [await inGuildTheme(source.guildId, () => starboardCard(source, count, emoji))],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { parse: [] }
				});
				return 'ok';
			} catch (error) {
				// 10008 Unknown Message — 스타보드 글을 누가 지웠어요
				if (typeof error === 'object' && error !== null && 'code' in error && error.code === 10008) return 'gone';
				deps.logger.warn(
					`[starboard] 스타보드 글 수정 실패 (${channelId}/${messageId}): ${error instanceof Error ? error.message : String(error)}`
				);
				return 'failed';
			}
		},

		async remove(channelId, messageId) {
			const channel = await getTextChannel(channelId);
			await channel?.messages.delete(messageId).catch(() => undefined);
		}
	};
}
