import { extractSocialTemplateRoleIds, renderSocialContent, SOCIAL_PLATFORM_LABELS, type SocialEvent, type SocialPlatform } from '@sirubot/utils';
import type { PrismaClient, SocialSubscription } from '@sirubot/prisma';
import { getLogger } from '../utils/logger.ts';
import type { NotifierRedis } from './redis.ts';

const logger = getLogger('dispatcher');

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks';
const WEBHOOK_TIMEOUT_MS = 10_000;
// 배달 실패 연속 5회 → 구독을 FAILED로 표시하고 재시도를 멈춰요 (plan §8).
const MAX_CONSECUTIVE_FAILURES = 5;
const FAILURE_COUNTER_TTL_SECONDS = 30 * 24 * 60 * 60;
const RETRY_AFTER_MAX_SECONDS = 60;
const EMBED_TITLE_MAX = 256;

/** 플랫폼별 임베드 accent color: 치지직은 브랜드 네온 그린(#00ffa3) */
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
	/** 라이브 섬네일: 구독 showThumbnail이 켜져 있고 이벤트에 이미지가 있을 때만 실려요 */
	image?: { url: string };
	footer: { text: string };
	timestamp: string;
}

interface SocialWebhookPayload {
	content?: string;
	embeds: SocialEmbed[];
	allowed_mentions: { parse: string[]; roles?: string[] };
	/** 이 메시지에서만 웹훅 이름을 바꿔요 (구독 webhookName 오버라이드) */
	username?: string;
	/** 이 메시지에서만 웹훅 프로필 사진을 바꿔요 (구독 webhookAvatarUrl 오버라이드) */
	avatar_url?: string;
}

type WebhookFetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export class SocialDispatcher {
	private readonly fetchFn: WebhookFetchFn;

	public constructor(private readonly options: { getDb: () => PrismaClient | null; redis: NotifierRedis; fetchFn?: WebhookFetchFn }) {
		this.fetchFn = options.fetchFn ?? fetch;
	}

	/** 이벤트 1건을 dedup → 팬아웃 → 웹훅 전송까지 처리해요. */
	public async dispatch(event: SocialEvent): Promise<void> {
		const db = this.options.getDb();
		if (!db) return;

		// dedup: (platform, contentId)가 이미 기록돼 있으면 스킵 (WebSub 중복 콜백·폴링 경합 방어)
		const existing = await db.socialEventLog
			.findUnique({ where: { platform_contentId: { platform: event.platform, contentId: event.contentId } } })
			.catch(() => null);
		if (existing) return;
		try {
			await db.socialEventLog.create({ data: { platform: event.platform, contentId: event.contentId, payload: event } });
		} catch {
			// P2002 등 동시 삽입 경합: 이미 다른 인스턴스가 처리했어요
			return;
		}

		// 팬아웃: 해당 소스를 구독 중인 활성 구독만.
		// 구독 생성 시점보다 오래된 콘텐츠는 알림에서 제외해요.
		// 신규 구독 직후 RSS 감사가 과거 영상 15개를 전부 뿜는 백필 폭발을 막아요 (plan §7).
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
			// 섬네일 표시가 꺼져 있거나 이벤트에 이미지가 없으면(Twitch) 조용히 생략해요.
			image: showThumbnail && event.thumbnail ? { url: event.thumbnail } : undefined,
			footer: { text: `${SOCIAL_PLATFORM_LABELS[event.platform]} 알림` },
			timestamp: new Date(event.publishedAt).toISOString()
		};
	}

	public buildPayload(subscription: SocialSubscription, event: SocialEvent): SocialWebhookPayload {
		// showThumbnail이 없는 이전 행(migration 미적용)은 undefined: 기본값 ON으로 취급해요.
		const embed = this.buildEmbed(event, subscription.showThumbnail !== false);
		const template = subscription.messageTemplate;
		const payload: SocialWebhookPayload = template
			? {
					content: renderSocialContent(template, event),
					embeds: [embed],
					// 웹훅은 기본적으로 모든 멘션을 핑하므로, 템플릿에 등장한 역할만 화이트리스트로 허용해요.
					allowed_mentions: { parse: [], roles: extractSocialTemplateRoleIds(template) }
				}
			: { embeds: [embed], allowed_mentions: { parse: [] } };
		// 구독별 표시 오버라이드: Discord 웹훅 execute의 username/avatar_url은 이 메시지에서만 적용돼요.
		// 웹훅 기본 표시는 그대로 두고, 수정하면 다음 알림부터 바로 반영돼요.
		if (subscription.webhookName) payload.username = subscription.webhookName;
		if (subscription.webhookAvatarUrl) payload.avatar_url = subscription.webhookAvatarUrl;
		return payload;
	}

	private async deliver(subscription: SocialSubscription, event: SocialEvent): Promise<void> {
		const url = `${DISCORD_WEBHOOK_URL}/${subscription.webhookId}/${subscription.webhookToken}`;
		const payload = this.buildPayload(subscription, event);

		let response = await this.postWebhook(url, payload);
		// 429는 Retry-After(1~60s 클램프)를 존중해 1회만 재시도해요
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
		// 죽은 웹훅: 즉시 FAILED (채널/웹훅 삭제, 재시도 정지)
		if (response && (response.status === 404 || response.status === 410)) {
			await this.markFailed(subscription, '웹훅이 삭제됐어요 (404/410)');
			return;
		}
		const failures = await this.options.redis.incrWithTtl(this.failureKey(subscription.id), FAILURE_COUNTER_TTL_SECONDS);
		if (failures >= MAX_CONSECUTIVE_FAILURES) {
			await this.markFailed(subscription, `웹훅 전송이 ${MAX_CONSECUTIVE_FAILURES}회 연속 실패했어요`);
		}
	}

	/** 네트워크 오류 등으로 요청 자체가 실패하면 null을 반환해요 (실패 카운팅은 호출부에서). */
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
