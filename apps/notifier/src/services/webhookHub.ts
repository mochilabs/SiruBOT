import {
	ManagedRedisSubscriber,
	PendingRequestPool,
	SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL,
	SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL,
	socialWebhookCreateResponseSchema,
	type SocialWebhookCreateRequest,
	type SocialWebhookCreateResponse
} from '@sirubot/utils';
import { unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { getLogger } from '../utils/logger.ts';
import type { NotifierRedis } from './redis.ts';

const logger = getLogger('webhook-hub');

const REQUEST_TIMEOUT_MS = 5_000;
const PENDING_LIMIT = 200;

export class SocialWebhookHub {
	private readonly signingKey: string;
	private readonly pending: PendingRequestPool<SocialWebhookCreateResponse>;
	private readonly pendingGuilds = new Map<string, string>();
	private readonly subscriber: ManagedRedisSubscriber | null;
	private subscriberStarted = false;

	constructor(
		private readonly redis: NotifierRedis,
		signingKey: string,
		redisUrl?: string
	) {
		this.signingKey = signingKey;
		this.pending = new PendingRequestPool<SocialWebhookCreateResponse>({
			capacity: PENDING_LIMIT,
			logger,
			timeoutResult: (requestId) => {
				const guildId = this.pendingGuilds.get(requestId) ?? '';
				this.pendingGuilds.delete(requestId);
				return { requestId, guildId, error: '봇이 응답하지 않았어요. 봇이 이 서버에 없거나 아직 연결되지 않았을 수 있어요.' };
			}
		});
		this.subscriber = redisUrl
			? new ManagedRedisSubscriber({
					name: '웹훅 생성 응답',
					url: redisUrl,
					logger,
					bindings: [{ channel: SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL, onMessage: (raw) => this.handleResponse(raw) }]
				})
			: null;
	}

	private async ensureSubscription(): Promise<boolean> {
		if (!this.subscriber) return false;
		if (!this.subscriberStarted) {
			this.subscriberStarted = true;
			await this.subscriber.start();
		}
		return this.subscriber.isSubscribed;
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
		if (this.pending.resolve(parsed.data.requestId, parsed.data)) {
			this.pendingGuilds.delete(parsed.data.requestId);
		}
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
		this.pendingGuilds.set(request.requestId, request.guildId);
		const promise = this.pending.register(request.requestId, REQUEST_TIMEOUT_MS);
		void client
			.publish(SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL, wrapRedisMessage(this.signingKey, request))
			.then(() => {
				logger.info(`웹훅 생성 요청 전송 (guildId=${request.guildId}, target=${request.targetChannelId})`);
			})
			.catch((error) => {
				if (
					this.pending.fail(request.requestId, {
						requestId: request.requestId,
						guildId: request.guildId,
						error: '웹훅 생성 요청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.'
					})
				) {
					this.pendingGuilds.delete(request.requestId);
				}
				logger.warn('웹훅 생성 요청 퍼블리시 실패:', String(error));
			});
		return promise;
	}

	async stop(): Promise<void> {
		this.pending.failAll((requestId) => ({ requestId, guildId: '', error: '서비스가 종료되고 있어요.' }));
		this.pendingGuilds.clear();
		if (this.subscriber) {
			await this.subscriber.stop();
		}
	}
}
