/**
 * 메시지 인용 리스너 — discord.com/channels/... 링크를 자체 인용 카드로 보여줘요.
 *
 * - 같은 길드의 링크만 인용해요 (다른 길드·DM은 원본 임베드만으로 충분해요).
 * - 소스 채널이 @everyone에게 보이지 않거나 NSFW면 건너뛰어요 — 비공개 콘텐츠 노출 방지가 인용보다 우선해요.
 * - 봇·웹훅 메시지는 무시하고, 유저당 3초 쿨다운으로 링크 도배를 막아요.
 */
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { type MessageLinkTarget, MemoryCache, parseMessageLinks } from '@sirubot/utils';
import { messageQuoteView } from '../../views/messageQuote.ts';
import { isChannelToggleEnabled } from '../../../services/guildService.ts';
import * as guildChatPolicy from '../../../services/guildSettings/chatPolicy.ts';

const QUOTE_IMAGE_MAX = 4;
const QUOTE_COOLDOWN_MS = 3_000;

@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class MessageQuoteListener extends Listener {
	private readonly cooldowns = new MemoryCache<string, true>({ ttl: QUOTE_COOLDOWN_MS, maxSize: 5_000 });

	public override async run(message: Message) {
		if (message.author.bot || !message.inGuild() || message.webhookId) return;
		if (!message.channel.isSendable()) return;

		try {
			const settings = await guildChatPolicy.getChatToolSettings(this.container.guildService, message.guildId);
			if (!isChannelToggleEnabled(settings.quote, message.channelId)) return;

			// 다른 길드·DM 링크는 원본 임베드가 있으니 이 길드 링크만 다뤄요
			const targets = parseMessageLinks(message.content).filter((target) => target.guildId === message.guildId);
			if (targets.length === 0) return;

			const cooldownKey = `${message.guildId}:${message.author.id}`;
			if (this.cooldowns.has(cooldownKey)) return;
			this.cooldowns.set(cooldownKey, true);

			const sources: Message[] = [];
			const images: string[] = [];

			for (const target of targets) {
				const source = await this.findQuotableMessage(message, target);
				if (!source) continue;
				sources.push(source);
				for (const attachment of source.attachments.values()) {
					if (images.length >= QUOTE_IMAGE_MAX) break;
					if (attachment.contentType?.startsWith('image/')) images.push(attachment.url);
				}
			}
			if (sources.length === 0) return;

			await message
				.reply({
					components: [messageQuoteView(sources, images)],
					flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
		} catch (error) {
			this.container.logger.error(`[messageQuote] unhandled error (guild ${message.guildId}): ${error}`);
		}
	}

	/** 인용해도 되는 원본 메시지 — 채널이 없거나 비공개·NSFW·스레드면 null을 돌려줘요 */
	private async findQuotableMessage(message: Message<true>, target: MessageLinkTarget): Promise<Message | null> {
		const channel = await message.guild.channels.fetch(target.channelId).catch(() => null);
		if (!channel || !channel.isTextBased() || channel.isThread()) return null;
		if (channel.nsfw) return null;
		// @everyone이 보지 못하는 채널은 비공개 채널이에요 — 인용하면 내용이 새어 나가요
		const everyoneOverwrite = channel.permissionOverwrites.cache.get(message.guild.roles.everyone.id);
		if (everyoneOverwrite?.deny.has(PermissionFlagsBits.ViewChannel)) return null;
		return channel.messages.fetch(target.messageId).catch(() => null);
	}
}
