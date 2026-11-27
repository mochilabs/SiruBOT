import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message, MessageFlags } from 'discord.js';
import { MemoryCache, customEmojiUrl, parseEmojiOnlyMessage } from '@sirubot/utils';
import { emojiEnlargeView } from '../../views/emojiEnlarge.ts';
import { isChannelToggleEnabled } from '../../../services/guildService.ts';
import * as guildChatPolicy from '../../../services/guildSettings/chatPolicy.ts';
import { isMessageFeatureEnabled } from '../../../services/guildSettings/modules.ts';
import { usageFeatureKey } from '@sirubot/utils/modules';
import { inGuildTheme } from '../../../lib/guildThemeScope.ts';

const ENLARGE_COOLDOWN_MS = 5_000;

@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class EmojiEnlargeListener extends Listener {
	private readonly cooldowns = new MemoryCache<string, true>({ ttl: ENLARGE_COOLDOWN_MS, maxSize: 5_000 });

	public override run(message: Message) {
		if (message.author.bot || !message.inGuild() || message.webhookId) return Promise.resolve();
		return inGuildTheme(message.guildId, () => this.handle(message));
	}

	private async handle(message: Message) {
		if (message.author.bot || !message.inGuild() || message.webhookId) return;
		if (!message.channel.isSendable()) return;

		try {
			if (!(await isMessageFeatureEnabled(this.container.guildService, message.guildId, 'emoji-enlarge'))) return;
			const settings = await guildChatPolicy.getChatToolSettings(this.container.guildService, message.guildId);
			if (!isChannelToggleEnabled(settings.emojiEnlarge, message.channelId)) return;

			const emojis = parseEmojiOnlyMessage(message.content);
			if (!emojis || emojis.length === 0) return;

			const cooldownKey = `${message.guildId}:${message.author.id}`;
			if (this.cooldowns.has(cooldownKey)) return;
			this.cooldowns.set(cooldownKey, true);

			this.container.usageRecorder?.record(message.guildId, usageFeatureKey('msg', 'emoji-enlarge'), message.author.id);

			const container = emojiEnlargeView(emojis.map((item) => customEmojiUrl(item)));

			const relayed = await this.container.webhookRelay.relay(message, {
				username: message.member?.displayName ?? message.author.displayName,
				avatarURL: message.author.displayAvatarURL({ size: 256, extension: 'png' }),
				components: [container]
			});
			if (relayed) return;

			await message
				.reply({
					components: [container],
					flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
		} catch (error) {
			this.container.logger.error(`[emojiEnlarge] unhandled error (guild ${message.guildId}): ${error}`);
		}
	}
}
