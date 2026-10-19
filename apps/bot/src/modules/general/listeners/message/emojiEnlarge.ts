/**
 * 이모지 확대 리스너 — 커스텀 이모지만으로 구성된 메시지를 큰 이미지로 다시 보여줘요.
 *
 * - 길드별 설정(이모지 확대 모드)로 채널 단위로 켜고 끄고, 판정 계약은 packages/utils/src/chatTools.ts예요.
 * - 확대 결과는 채널 웹훅으로 "이모지를 보낸 사람" 이름·프사로 보내요 (임베드 복구와 같은 방식).
 * - 유저당 5초 쿨다운으로 같은 이모지를 반복해서 확대하는 도배를 막아요.
 * - 봇·웹훅 메시지는 무시해요 (자기 재전송 루프 방지).
 */
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { MediaGalleryBuilder, MediaGalleryItemBuilder, Message, MessageFlags } from 'discord.js';
import { MemoryCache, createContainer, customEmojiUrl, parseEmojiOnlyMessage } from '@sirubot/utils';
import { isChannelToggleEnabled } from '../../../../services/guildService.ts';
import { relayViaWebhook } from '../../../../services/webhookRelay.ts';

const ENLARGE_COOLDOWN_MS = 5_000;

@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class EmojiEnlargeListener extends Listener {
	private readonly cooldowns = new MemoryCache<string, true>({ ttl: ENLARGE_COOLDOWN_MS, maxSize: 5_000 });

	public override async run(message: Message) {
		if (message.author.bot || !message.inGuild() || message.webhookId) return;
		if (!message.channel.isSendable()) return;

		try {
			const settings = await this.container.guildService.getChatToolSettings(message.guildId);
			if (!isChannelToggleEnabled(settings.emojiEnlarge, message.channelId)) return;

			const emojis = parseEmojiOnlyMessage(message.content);
			if (!emojis || emojis.length === 0) return;

			const cooldownKey = `${message.guildId}:${message.author.id}`;
			if (this.cooldowns.has(cooldownKey)) return;
			this.cooldowns.set(cooldownKey, true);

			const container = createContainer();
			const gallery = new MediaGalleryBuilder();
			for (const item of emojis) {
				gallery.addItems(new MediaGalleryItemBuilder().setURL(customEmojiUrl(item)));
			}
			container.addMediaGalleryComponents(gallery);

			const relayed = await relayViaWebhook(message, {
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
