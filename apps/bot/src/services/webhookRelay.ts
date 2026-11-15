/**
 * 웹훅 릴레이 — 봇이 만든 채널 웹훅으로 메시지를 원작자 이름·프사로 보내요.
 *
 * - 임베드 복구 결과를 "링크를 보낸 사람" 아이디로 띄우기 위해서예요 (embed-fixer 관행).
 * - 채널에 우리 웹훅이 없으면 만들고, 60초 캐시로 재사용해요 (fetch/create 절약).
 * - 스레드(웹훅 못 만듦)·권한 없음·전송 실패면 false — 호출자는 message.reply 폴백으로 봇 아이디로 보내요.
 */
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
	/** 원작자 표시 이름 */
	username: string;
	/** 원작자 프사 URL */
	avatarURL: string;
	content?: string;
	components?: ContainerBuilder[];
}

/** 웹훅을 만들 수 있는 채널 — 스레드는 웹훅 생성을 지원하지 않아요 */
type WebhookChannel = Exclude<GuildTextBasedChannel, AnyThreadChannel>;

/** 웹훅 릴레이가 쓰는 의존성 — 봇 유저는 로그인 뒤에야 생겨서 호출 시점에 읽어요 */
export interface WebhookRelayDeps {
	logger: AppLogger;
	getBotUser: () => ClientUser | null | undefined;
}

/** 웹훅 릴레이 — 채널별 웹훅 캐시(60초)를 인스턴스가 소유해요 (container.webhookRelay) */
export class WebhookRelay {
	/** 채널별 웹훅 캐시 */
	private readonly webhooks = new MemoryCache<string, Webhook>({ ttl: WEBHOOK_CACHE_TTL_MS, maxSize: 500 });

	public constructor(private readonly deps: WebhookRelayDeps) {}

	/** 채널에 우리 봇이 만든 웹훅이 있는지 찾고 없으면 만들어요 */
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

	/** 원작자 이름·프사로 웹훅 전송 — 실패하면 false (호출자가 message.reply로 봇 아이디 폴백) */
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
