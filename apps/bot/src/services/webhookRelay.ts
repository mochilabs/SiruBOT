import { MemoryCache } from '@sirubot/utils';
import {
	type AnyThreadChannel,
	type ClientUser,
	ContainerBuilder,
	type GuildTextBasedChannel,
	Message,
	MessageFlags,
	PermissionFlagsBits,
	type Webhook
} from 'discord.js';
import type { AppLogger } from '../lib/appLogger.ts';

const WEBHOOK_NAME = 'SiruBOT 임베드';
const WEBHOOK_CACHE_TTL_MS = 60_000;

export interface WebhookRelayOptions {
	username: string;
	avatarURL: string;
	content?: string;
	components?: ContainerBuilder[];
}

// 스레드는 웹훅 생성을 지원하지 않아요
type WebhookChannel = Exclude<GuildTextBasedChannel, AnyThreadChannel>;

export interface WebhookRelayDeps {
	logger: AppLogger;
	getBotUser: () => ClientUser | null | undefined;
}

export class WebhookRelay {
	private readonly webhooks = new MemoryCache<string, Webhook>({ ttl: WEBHOOK_CACHE_TTL_MS, maxSize: 500 });

	public constructor(private readonly deps: WebhookRelayDeps) {}

	private async getOrCreateWebhook(channel: WebhookChannel): Promise<Webhook | null> {
		const cached = this.webhooks.get(channel.id);
		if (cached) return cached;

		const botUser = this.deps.getBotUser();
		if (!botUser) return null;

		const existing = await channel.fetchWebhooks().catch(() => null);
		const own = existing?.find((hook) => hook.owner?.id === botUser.id);
		if (own) {
			this.webhooks.set(channel.id, own);
			return own;
		}

		const created = await channel
			.createWebhook({
				name: WEBHOOK_NAME,
				avatar: botUser.displayAvatarURL({ size: 256 }),
				reason: '임베드 복구 결과를 원작자 이름으로 보내기 위한 웹훅이에요'
			})
			.catch(() => null);
		if (created) this.webhooks.set(channel.id, created);
		return created;
	}

	public async relay(message: Message<true>, options: WebhookRelayOptions): Promise<boolean> {
		const channel = message.channel;
		if (channel.isThread()) return false;

		const me = message.guild.members.me;
		if (!me) return false;
		if (!channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageWebhooks)) return false;

		const webhook = await this.getOrCreateWebhook(channel);
		if (!webhook) return false;

		try {
			await webhook.send({
				username: options.username,
				avatarURL: options.avatarURL,
				content: options.content,
				...(options.components
					? {
							components: options.components,
							withComponents: true,
							flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications]
						}
					: { flags: [MessageFlags.SuppressNotifications] }),
				allowedMentions: { parse: [] }
			});
			return true;
		} catch (error) {
			this.webhooks.delete(channel.id);
			this.deps.logger.debug(
				`[webhookRelay] send failed (channel ${message.channelId}): ${error instanceof Error ? error.message : String(error)}`
			);
			return false;
		}
	}
}
