import type { RedisClientType } from '@redis/client';
import type { SocialWebhookCreateRequest, SocialWebhookCreateResponse } from '@sirubot/utils';
import { SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL, SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL, socialWebhookCreateResponseSchema } from '@sirubot/utils';
import { unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { getLogger } from '../utils/logger.ts';
import type { NotifierRedis } from './redis.ts';

const logger = getLogger('webhook-hub');

/** 봇 미응답 판정 시간 — guildDataHub와 동일한 5초예요. */
const REQUEST_TIMEOUT_MS = 5_000;
/** 동시 대기 상한 — 무한 pending 방지 (guildDataHub PENDING_LIMIT과 동일). */
const PENDING_LIMIT = 200;

interface PendingEntry {
	resolve: (response: SocialWebhookCreateResponse) => void;
	timer: NodeJS.Timeout;
}

/**
 * 웹훅 생성 request/reply 허브 — 대시보드 구독 추가 요청을 봇에 넘기고 requestId로 응답을 상관해요.
 * 봇의 socialWebhookResponder가 REQUEST 채널을 구독해 createWebhook 후 RESPONSE 채널로 돌려줘요.
 * 응답 대기는 항상 시간 제한으로 끝나요(에러도 응답 계약에 실어 반환) — 호출자가 reject 처리를 따로 안 해도 돼요.
 */
export class SocialWebhookHub {
	private readonly signingKey: string;
	private readonly pending = new Map<string, PendingEntry>();
	private subscriber: RedisClientType | null = null;

	constructor(
		private readonly redis: NotifierRedis,
		signingKey: string
	) {
		this.signingKey = signingKey;
	}

	/** RESPONSE 구독이 필요해요 — Redis가 아직 준비되지 않았으면 false를 돌려주고 요청 시점에 다시 시도해요. */
	private async ensureSubscription(): Promise<boolean> {
		if (this.subscriber) return true;
		const client = this.redis.getClient();
		if (!client) return false;
		try {
			const subscriber = client.duplicate();
			await subscriber.connect();
			await subscriber.subscribe(SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL, (raw: string) => this.handleResponse(raw));
			this.subscriber = subscriber;
			return true;
		} catch (error) {
			logger.warn('웹훅 생성 응답 구독 실패 (Redis가 아직 준비되지 않았을 수 있어요):', String(error));
			return false;
		}
	}

	private handleResponse(raw: string): void {
		const body = unwrapRedisMessage(this.signingKey, raw);
		if (!body) return;
		let parsedJson: unknown;
		try {
			parsedJson = JSON.parse(body);
		} catch {
			return;
		}
		const parsed = socialWebhookCreateResponseSchema.safeParse(parsedJson);
		if (!parsed.success) return;
		const entry = this.pending.get(parsed.data.requestId);
		if (!entry) return;
		clearTimeout(entry.timer);
		this.pending.delete(parsed.data.requestId);
		entry.resolve(parsed.data);
	}

	async requestWebhookCreate(request: SocialWebhookCreateRequest): Promise<SocialWebhookCreateResponse> {
		const subscribed = await this.ensureSubscription();
		const client = this.redis.getClient();
		if (!subscribed || !client) {
			return { requestId: request.requestId, guildId: request.guildId, error: '봇과 통신할 Redis 연결이 없어요. 관리자에게 문의해 주세요.' };
		}
		if (this.pending.size >= PENDING_LIMIT) {
			return { requestId: request.requestId, guildId: request.guildId, error: '요청이 너무 몰려 있어요. 잠시 후 다시 시도해 주세요.' };
		}
		return new Promise<SocialWebhookCreateResponse>((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(request.requestId);
				resolve({
					requestId: request.requestId,
					guildId: request.guildId,
					error: '봇이 응답하지 않았어요. 봇이 이 서버에 없거나 아직 연결되지 않았을 수 있어요.'
				});
			}, REQUEST_TIMEOUT_MS);
			this.pending.set(request.requestId, { resolve, timer });
			void client
				.publish(SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL, wrapRedisMessage(this.signingKey, request))
				.then(() => {
					logger.info(`웹훅 생성 요청 전송 (guildId=${request.guildId}, target=${request.targetChannelId})`);
				})
				.catch((error) => {
					clearTimeout(timer);
					this.pending.delete(request.requestId);
					logger.warn('웹훅 생성 요청 퍼블리시 실패:', String(error));
					resolve({
						requestId: request.requestId,
						guildId: request.guildId,
						error: '웹훅 생성 요청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.'
					});
				});
		});
	}

	async stop(): Promise<void> {
		const subscriber = this.subscriber;
		this.subscriber = null;
		for (const [requestId, entry] of this.pending) {
			clearTimeout(entry.timer);
			entry.resolve({ requestId, guildId: '', error: '서비스가 종료되고 있어요.' });
		}
		this.pending.clear();
		if (subscriber) {
			await subscriber.quit().catch(() => null);
		}
	}
}
