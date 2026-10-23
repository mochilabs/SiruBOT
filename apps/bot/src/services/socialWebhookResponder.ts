/**
 * 소셜 알림 웹훅 생성 응답자 — 대시보드 소셜 알림 구독 추가 → notifier → Redis → 봇 수행.
 *
 * Discord 웹훅 생성은 Manage Webhooks 권한이 필요해요 — 대시보드 유저 토큰으로는 만들 수
 * 없고 봇 토큰으로만 가능해요. 구독 추가 시점에 이 응답자가 대상 채널에 웹훅을 딱 한 번
 * 만들고 {webhookId, webhookToken}을 응답해요 — notifier가 그걸 DB에 저장하고, 이후 알림
 * 전송은 봇을 거치지 않고 웹훅으로 곧바로 가요. 봇은 이 생성 순간에만 관여해요.
 *
 * - 이 프로세스가 보유하지 않은 길드면 조용히 무시해요 — 다른 레플리카가 응답해요.
 *   아무도 응답하지 않으면 요청자(notifier)가 타임아웃으로 처리해요.
 * - 실패(채널 없음·권한 부족·웹훅 한도)는 한국어 error 메시지로 응답해요 — 대시보드가
 *   그대로 안내해요.
 * - 어떤 경우에도 절대 throw하지 않아요 — 처리 실패는 요청자의 타임아웃 폴백으로 이어져요.
 */
import { DiscordAPIError } from 'discord.js';
import { container } from '@sapphire/framework';
import { emoji, ManagedRedisSubscriber, SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL, socialWebhookCreateRequestSchema } from '@sirubot/utils';
import { discordApiErrorText } from '../lib/discordErrorText.ts';
import { unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import type { SocialWebhookCreateResponse } from '@sirubot/utils';
import type { ServiceLogger } from './types.ts';

/** Discord API 오류 코드 — 웹훅 한도 */
const DISCORD_MAX_WEBHOOKS = 220001;

/** 처리 흐름의 실패를 한국어 안내로 바꿔요 — 사용자가 고칠 수 있는 행동별로 구분해요 */
function toKoreanError(error: unknown): string {
	if (error instanceof DiscordAPIError && error.code === DISCORD_MAX_WEBHOOKS) {
		return `${emoji('error')} 이 채널의 웹훅 한도(10개)가 가득 찼어요. 사용하지 않는 웹훅을 삭제한 뒤 다시 시도해 주세요.`;
	}
	return discordApiErrorText(error, {
		permission: '웹훅 생성 권한이 봇에 없어요. 서버 설정에서 봇 역할의 웹훅 관리 권한을 확인해 주세요.',
		fallback: `${emoji('error')} 웹훅을 만들지 못했어요. 잠시 후 다시 시도해 주세요.`
	});
}

export class SocialWebhookResponder {
	private subscriber: ManagedRedisSubscriber | null = null;
	private readonly inFlight = new Set<string>();

	public constructor(
		private readonly logger: ServiceLogger,
		// Redis 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY. 비어 있으면 서명 없는 구버전 모드(개발용).
		private readonly signingKey: string = ''
	) {}

	/**
	 * 구독을 시작해요. 실패해도 throw하지 않아요 — 소셜 알림 구독 추가만 타임아웃 폴백으로 끝나고,
	 * 전용 구독 관리자가 자체 백오프(5s→60s)로 재연결을 시도해요.
	 */
	public async start(redisUrl: string | undefined): Promise<void> {
		const url = redisUrl?.trim() || null;
		if (!url) {
			this.logger.warn('REDIS_URL 미설정: 소셜 알림 웹훅 생성 응답 없이 동작해요 (구독 추가는 타임아웃 폴백해요)');
			return;
		}
		this.subscriber = new ManagedRedisSubscriber({
			name: '소셜 웹훅 생성',
			url,
			logger: this.logger,
			bindings: [
				{
					channel: SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL,
					// 서명 검증을 통과한 본문만 처리해요 (SEC-006).
					onMessage: (raw) => {
						const body = unwrapRedisMessage(this.signingKey, raw);
						if (body === null) {
							this.logger.warn('소셜 웹훅 생성 요청 거부: 서명 검증 실패');
							return;
						}
						void this.handleRequest(body);
					}
				}
			]
		});
		await this.subscriber.start();
	}

	/** 종료 — 구독 해제 후 연결을 닫아요. 호출자(shutdown)는 redisStore.disconnect() 전에 불러야 해요. */
	public async stop(): Promise<void> {
		const subscriber = this.subscriber;
		this.subscriber = null;
		await subscriber?.stop();
	}

	private async handleRequest(raw: string): Promise<void> {
		let payload: unknown;
		try {
			payload = JSON.parse(raw);
		} catch {
			this.logger.debug(`소셜 웹훅 생성 요청이 JSON이 아니어서 무시: ${raw.slice(0, 100)}`);
			return;
		}
		const request = socialWebhookCreateRequestSchema.safeParse(payload);
		if (!request.success) {
			this.logger.debug(`소셜 웹훅 생성 요청 페이로드 형식 불일치, 무시: ${raw.slice(0, 100)}`);
			return;
		}
		const guild = container.client.guilds.cache.get(request.data.guildId);
		if (!guild) return; // 다른 레플리카가 보유한 길드 — 그쪽이 응답해요 (아무도 없으면 요청자 타임아웃)

		const { guildId, targetChannelId, name, requestId } = request.data;
		if (this.inFlight.has(guildId)) {
			this.respond({
				requestId,
				guildId,
				error: `${emoji('bulb')} 이 서버의 이전 웹훅 생성 요청을 아직 처리하고 있어요. 잠시 후 다시 시도해 주세요.`
			});
			return;
		}

		this.inFlight.add(guildId);
		try {
			const channel = guild.channels.cache.get(targetChannelId);
			if (!channel) {
				this.respond({ requestId, guildId, error: `${emoji('error')} 채널을 찾을 수 없어요.` });
				return;
			}
			if (!('createWebhook' in channel)) {
				this.respond({
					requestId,
					guildId,
					error: `${emoji('error')} 이 채널 종류에는 웹훅을 만들 수 없어요. 텍스트·음성 채널에서 선택해 주세요.`
				});
				return;
			}
			const webhook = await channel.createWebhook({ name, reason: '대시보드 소셜 알림 구독 추가' });
			if (!webhook.token) {
				this.respond({ requestId, guildId, error: `${emoji('error')} 웹훅 토큰을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.` });
				return;
			}
			this.logger.info(`소셜 알림 웹훅 생성 완료 (guild ${guildId}, channel ${targetChannelId}, webhook ${webhook.id})`);
			this.respond({ requestId, guildId, webhookId: webhook.id, webhookToken: webhook.token });
		} catch (error) {
			this.logger.error(
				`소셜 알림 웹훅 생성 실패 (guild ${guildId}, channel ${targetChannelId}): ${error instanceof Error ? error.message : String(error)}`
			);
			this.respond({ requestId, guildId, error: toKoreanError(error) });
		} finally {
			this.inFlight.delete(guildId);
		}
	}

	/** 응답을 RESPONSE 채널로 퍼블리시해요 (redisStore 없으면 로그만 남겨요) */
	private respond(response: SocialWebhookCreateResponse): void {
		const store = container.redisStore;
		if (!store) {
			this.logger.warn(`소셜 웹훅 생성 응답을 위한 redisStore가 없어요 (guild ${response.guildId})`);
			return;
		}
		store.publishSocialWebhookCreateResponse(wrapRedisMessage(this.signingKey, response));
	}
}
