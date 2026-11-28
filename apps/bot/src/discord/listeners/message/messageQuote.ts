import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { type MessageLinkTarget, MemoryCache, parseMessageLinks } from '@sirubot/utils';
import { messageQuoteView } from '../../views/messageQuote.ts';
import { isChannelToggleEnabled } from '../../../services/guildService.ts';
import * as guildChatPolicy from '../../../services/guildSettings/chatPolicy.ts';
import { isMessageFeatureEnabled } from '../../../services/guildSettings/modules.ts';
import { usageFeatureKey } from '@sirubot/utils/modules';
import { inGuildTheme } from '../../../lib/guildThemeScope.ts';

const QUOTE_IMAGE_MAX = 4;
const QUOTE_COOLDOWN_MS = 3_000;

@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class MessageQuoteListener extends Listener {
	private readonly cooldowns = new MemoryCache<string, true>({ ttl: QUOTE_COOLDOWN_MS, maxSize: 5_000 });

	public override run(message: Message) {
		if (message.author.bot || !message.inGuild() || message.webhookId) return Promise.resolve();
		return inGuildTheme(message.guildId, () => this.handle(message));
	}

	private async handle(message: Message) {
		if (message.author.bot || !message.inGuild() || message.webhookId) return;
		if (!message.channel.isSendable()) return;

		try {
			if (!(await isMessageFeatureEnabled(this.container.guildService, message.guildId, 'message-quote'))) return;
			const settings = await guildChatPolicy.getChatToolSettings(this.container.guildService, message.guildId);
			if (!isChannelToggleEnabled(settings.quote, message.channelId)) return;

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
			this.container.usageRecorder?.record(message.guildId, usageFeatureKey('msg', 'message-quote'), message.author.id);

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

	private async findQuotableMessage(message: Message<true>, target: MessageLinkTarget): Promise<Message | null> {
		const channel = await message.guild.channels.fetch(target.channelId).catch(() => null);
		if (!channel || !channel.isTextBased() || channel.isThread()) return null;
		if (channel.nsfw) return null;
		const everyoneOverwrite = channel.permissionOverwrites.cache.get(message.guild.roles.everyone.id);
		if (everyoneOverwrite?.deny.has(PermissionFlagsBits.ViewChannel)) return null;
		return channel.messages.fetch(target.messageId).catch(() => null);
	}
}
