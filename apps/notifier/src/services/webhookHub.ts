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

/** 봇 미응답 판정 시간: guildDataHub와 동일한 5초예요. */
const REQUEST_TIMEOUT_MS = 5_000;
/** 동시 대기 상한: 무한 pending 방지 (guildDataHub PENDING_LIMIT과 동일). */
const PENDING_LIMIT = 200;

/**
 * 웹훅 생성 request/reply 허브: 대시보드 구독 추가 요청을 봇에 넘기고 requestId로 응답을 상관해요.
 * 봇의 socialWebhookResponder가 REQUEST 채널을 구독해 createWebhook 후 RESPONSE 채널로 돌려줘요.
 * 응답 대기는 항상 시간 제한으로 끝나요(에러도 응답 계약에 실어 반환): 호출자가 reject 처리를 따로 안 해도 돼요.
 * 응답 구독은 공용 ManagedRedisSubscriber(백오프 재연결·재구독)에, 대기의 용량 상한·타임아웃 회수는 공용 PendingRequestPool에 위임해요.
 */
export class SocialWebhookHub {
	private readonly signingKey: string;
	private readonly pending: PendingRequestPool<SocialWebhookCreateResponse>;
	/** requestId별 guildId: 에러 페이로드에 요청의 guildId를 싣는 용도예요. 완료·회수·종료 경로에서 함께 정리해요. */
	private readonly pendingGuilds = new Map<string, string>();
	private readonly subscriber: ManagedRedisSubscriber | null;
	/** 구독은 최초 요청 시점에 시작해요. 이후 연결 유지·재시도는 ManagedRedisSubscriber의 백오프가 담당해요. */
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
			// guildId 조회와 맵 정리를 timeoutResult 한 자리에서 해요. 풀의 모든 타임아웃 완료 경로
			// (용량 초과·중복 id·타이머)가 이 팩토리를 거치므로 호출 순서에 의존하지 않고 맵 누수가 없어요.
			timeoutResult: (requestId) => {
				const guildId = this.pendingGuilds.get(requestId) ?? '';
				this.pendingGuilds.delete(requestId);
				return { requestId, guildId, error: '봇이 응답하지 않았어요. 봇이 이 서버에 없거나 아직 연결되지 않았을 수 있어요.' };
			}
		});
		// REDIS_URL이 없으면 구독자를 만들지 않아요. 요청은 'Redis 연결이 없어요'로 즉시 응답해요.
		this.subscriber = redisUrl
			? new ManagedRedisSubscriber({
					name: '웹훅 생성 응답',
					url: redisUrl,
					logger,
					bindings: [{ channel: SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL, onMessage: (raw) => this.handleResponse(raw) }]
				})
			: null;
	}

	/** RESPONSE 구독을 요청 시점에 확보해요. REDIS_URL이 없거나 아직 구독이 완료되지 않았으면 false를 돌려줘요. */
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
		// 용량 초과는 별도 안내 메시지가 있어 풀의 즉시 실패(타임아웃 페이로드)와 구분해요. 등록 전에 여기서 판정해요.
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
				// publish 실패: 응답이 절대 오지 않으니 즉시 실패로 정리해요
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
