import { extractSocialTemplateRoleIds, renderSocialContent, SOCIAL_PLATFORM_LABELS, type SocialEvent, type SocialPlatform } from '@sirubot/utils';
import type { PrismaClient, SocialSubscription } from '@sirubot/prisma';
import { getLogger } from '../utils/logger.ts';
import type { NotifierRedis } from './redis.ts';
import { openWebhookToken } from './secretStorage.ts';

const logger = getLogger('dispatcher');

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks';
const WEBHOOK_TIMEOUT_MS = 10_000;
const MAX_CONSECUTIVE_FAILURES = 5;
const FAILURE_COUNTER_TTL_SECONDS = 30 * 24 * 60 * 60;
const RETRY_AFTER_MAX_SECONDS = 60;
const EMBED_TITLE_MAX = 256;

const PLATFORM_COLORS: Record<SocialPlatform, number> = {
	youtube: 0xff0000,
	twitch: 0x9146ff,
	chzzk: 0x00ffa3
};

interface SocialEmbed {
	title: string;
	url: string;
	color: number;
	author?: { name: string };
	image?: { url: string };
	footer: { text: string };
	timestamp: string;
}

interface SocialWebhookPayload {
	content?: string;
	embeds: SocialEmbed[];
	allowed_mentions: { parse: string[]; roles?: string[] };
	username?: string;
	avatar_url?: string;
}

type WebhookFetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export class SocialDispatcher {
	private readonly fetchFn: WebhookFetchFn;

	public constructor(private readonly options: { getDb: () => PrismaClient | null; redis: NotifierRedis; fetchFn?: WebhookFetchFn }) {
		this.fetchFn = options.fetchFn ?? fetch;
	}

	public async dispatch(event: SocialEvent): Promise<void> {
		const db = this.options.getDb();
		if (!db) return;

		const existing = await db.socialEventLog
			.findUnique({ where: { platform_contentId: { platform: event.platform, contentId: event.contentId } } })
			.catch(() => null);
		if (existing) return;
		try {
			await db.socialEventLog.create({ data: { platform: event.platform, contentId: event.contentId, payload: event } });
		} catch {
			return;
		}

		// 구독 생성 이전 콘텐츠는 제외해 RSS 감사 백필 폭발을 막아요.
		const subscriptions = await db.socialSubscription
			.findMany({
				where: {
					platform: event.platform,
					sourcePlatformId: event.sourceId,
					status: 'active',
					createdAt: { lte: new Date(event.publishedAt) }
				}
			})
			.catch((error: unknown) => {
				logger.error('구독 목록 조회 실패: 이벤트 알림을 건너뛰어요:', String(error));
				return [];
			});
		if (subscriptions.length === 0) return;

		await Promise.allSettled(subscriptions.map((subscription) => this.deliver(subscription, event)));
	}

	private buildEmbed(event: SocialEvent, showThumbnail: boolean): SocialEmbed {
		const title = event.title.length > EMBED_TITLE_MAX ? `${event.title.slice(0, EMBED_TITLE_MAX - 1)}…` : event.title;
		return {
			title,
			url: event.url,
			color: PLATFORM_COLORS[event.platform],
			author: { name: event.author },
			image: showThumbnail && event.thumbnail ? { url: event.thumbnail } : undefined,
			footer: { text: `${SOCIAL_PLATFORM_LABELS[event.platform]} 알림` },
			timestamp: new Date(event.publishedAt).toISOString()
		};
	}

	public buildPayload(subscription: SocialSubscription, event: SocialEvent): SocialWebhookPayload {
		const embed = this.buildEmbed(event, subscription.showThumbnail !== false);
		const template = subscription.messageTemplate;
		const payload: SocialWebhookPayload = template
			? {
					content: renderSocialContent(template, event),
					embeds: [embed],
					allowed_mentions: { parse: [], roles: extractSocialTemplateRoleIds(template) }
				}
			: { embeds: [embed], allowed_mentions: { parse: [] } };
		if (subscription.webhookName) payload.username = subscription.webhookName;
		if (subscription.webhookAvatarUrl) payload.avatar_url = subscription.webhookAvatarUrl;
		return payload;
	}

	private async deliver(subscription: SocialSubscription, event: SocialEvent): Promise<void> {
		const webhookToken = openWebhookToken(subscription.webhookToken);
		if (!webhookToken) {
			await this.markFailed(subscription, '웹훅 토큰을 복호할 수 없어요 (암호화 키 확인)');
			return;
		}
		const url = `${DISCORD_WEBHOOK_URL}/${subscription.webhookId}/${webhookToken}`;
		const payload = this.buildPayload(subscription, event);

		let response = await this.postWebhook(url, payload);
		if (response?.status === 429) {
			const raw = Number(response.headers.get('retry-after'));
			const delaySeconds = Number.isFinite(raw) && raw > 0 ? Math.min(raw, RETRY_AFTER_MAX_SECONDS) : 1;
			await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
			response = await this.postWebhook(url, payload);
		}

		if (response?.ok) {
			await this.options.redis.del(this.failureKey(subscription.id));
			return;
		}
		if (response && (response.status === 404 || response.status === 410)) {
			await this.markFailed(subscription, '웹훅이 삭제됐어요 (404/410)');
			return;
		}
		const failures = await this.options.redis.incrWithTtl(this.failureKey(subscription.id), FAILURE_COUNTER_TTL_SECONDS);
		if (failures >= MAX_CONSECUTIVE_FAILURES) {
			await this.markFailed(subscription, `웹훅 전송이 ${MAX_CONSECUTIVE_FAILURES}회 연속 실패했어요`);
		}
	}

	private async postWebhook(url: string, payload: SocialWebhookPayload): Promise<Response | null> {
		try {
			return await this.fetchFn(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
			});
		} catch (error) {
			logger.warn('웹훅 POST 실패:', String(error));
			return null;
		}
	}

	private failureKey(subscriptionId: string): string {
		return `sirubot:social:delivery-fail:${subscriptionId}`;
	}

	private async markFailed(subscription: SocialSubscription, reason: string): Promise<void> {
		logger.warn(`구독 ${subscription.id}를 FAILED로 표시해요. ${reason}`);
		await this.options.redis.del(this.failureKey(subscription.id));
		const db = this.options.getDb();
		await db?.socialSubscription.update({ where: { id: subscription.id }, data: { status: 'failed' } }).catch(() => null);
	}
}
