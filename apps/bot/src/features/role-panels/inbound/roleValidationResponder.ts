import { container } from '@sapphire/framework';
import { ManagedRedisSubscriber, ROLE_VALIDATION_REQUEST_CHANNEL, roleValidationRequestSchema, type RoleValidationResponse } from '@sirubot/utils';
import { unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import type { ServiceLogger } from '../../../services/types.ts';

/**
 * 역할 부여 가능 여부 검증 응답자 — 대시보드가 패널 저장 전에 roleIds를 보내 부여 가능한 역할인지 확인해요.
 *
 * 대시보드가 data-api `/v1/internal/role-panel/validate-roles`에 요청하면 data-api가 REQUEST 채널
 * (`sirubot:role-validation:request`)로 {requestId, guildId, roleIds}를 브로드캐스트하고, 그 길드를 보유한
 * 봇 프로세스가 rolePanelService.validateRoles로 검증한 뒤 RESPONSE 채널로 invalidRoleIds를 응답해요.
 *
 * - 이 프로세스가 보유하지 않은 길드면 조용히 무시해요.
 * - 어떤 경우에도 절대 throw하지 않아요.
 */
export class RoleValidationResponder {
	private subscriber: ManagedRedisSubscriber | null = null;

	public constructor(
		private readonly logger: ServiceLogger,
		private readonly signingKey: string = ''
	) {}

	public async start(redisUrl: string | undefined): Promise<void> {
		const url = redisUrl?.trim() || null;
		if (!url) {
			this.logger.warn('REDIS_URL 미설정: 역할 검증 응답 없이 동작해요 (대시보드 역할 검증은 타임아웃 폴백해요)');
			return;
		}
		this.subscriber = new ManagedRedisSubscriber({
			name: '역할 검증',
			url,
			logger: this.logger,
			bindings: [
				{
					channel: ROLE_VALIDATION_REQUEST_CHANNEL,
					onMessage: (raw) => {
						const body = unwrapRedisMessage(this.signingKey, raw);
						if (body === null) {
							this.logger.warn('역할 검증 요청 거부: 서명 검증 실패');
							return;
						}
						void this.handleRequest(body);
					}
				}
			]
		});
		await this.subscriber.start();
	}

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
			this.logger.debug(`역할 검증 요청이 JSON이 아니어서 무시: ${raw.slice(0, 100)}`);
			return;
		}
		const request = roleValidationRequestSchema.safeParse(payload);
		if (!request.success) {
			this.logger.debug(`역할 검증 요청 페이로드 형식 불일치, 무시: ${raw.slice(0, 100)}`);
			return;
		}
		const guild = container.client.guilds.cache.get(request.data.guildId);
		if (!guild) return; // 다른 레플리카가 보유한 길드

		const { guildId, roleIds } = request.data;
		try {
			const invalidRoleIds = container.rolePanelService.validateRoles(guild, roleIds);
			this.respond({ requestId: request.data.requestId, guildId, invalidRoleIds });
		} catch (error) {
			this.logger.error(`역할 검증 실패 (guild ${guildId}): ${error instanceof Error ? error.message : String(error)}`);
			this.respond({
				requestId: request.data.requestId,
				guildId,
				error: `역할을 검증하지 못했어요. 잠시 후 다시 시도해 주세요.`
			});
		}
	}

	private respond(response: RoleValidationResponse): void {
		const store = container.redisStore;
		if (!store) {
			this.logger.warn(`역할 검증 응답을 위한 redisStore가 없어요 (guild ${response.guildId})`);
			return;
		}
		store.publishRoleValidationResponse(wrapRedisMessage(this.signingKey, response));
	}
}
