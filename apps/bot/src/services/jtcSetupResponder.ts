/**
 * 임시 방(JTC) 마커 채널 셋업 응답자 — 대시보드 설정 화면의 마커 채널 생성·이동 요청 → data-api Redis → 봇 수행.
 *
 * 마커 채널 생성과 카테고리 이동은 Discord 규격상 봉 토큰으로만 가능해요 (유저 OAuth 토큰에는
 * 길드 채널 관리 권한이 없어요). data-api jtcSetupHub가 Redis 채널(`sirubot:jtc-setup:request`)로
 * {requestId, guildId, categoryId}를 브로드캐스트하면, 그 길드를 보유한 봇 프로세스만 이 응답자가
 * tempVoiceService.setupMarkerChannel을 수행한 뒤 `sirubot:jtc-setup:response` 채널로 응답해요.
 *
 * - 이 프로세스가 보유하지 않은 길드면 조용히 무시해요 — 다른 레플리카가 응답해요.
 *   아무도 응답하지 않으면 data-api가 타임아웃으로 처리해요.
 * - 검증 실패(카테고리 아님·채널 없음)와 봇 권한 부족은 한국어 error 메시지로 응답해요 —
 *   data-api가 그대로 400으로 전달해 대시보드에서 안내해요.
 * - 어떤 경우에도 절대 throw하지 않아요 — 처리 실패는 대시보드의 타임아웃 폴백으로 이어져요.
 */
import { DiscordAPIError } from 'discord.js';
import { container } from '@sapphire/framework';
import { emoji, JTC_SETUP_REQUEST_CHANNEL, jtcSetupRequestSchema, ManagedRedisSubscriber } from '@sirubot/utils';
import type { JtcSetupResponse } from '@sirubot/utils';

/** 카테고리 채널이 아니거나 존재하지 않을 때 tempVoiceService가 던지는 오류 메시지 */
const NOT_CATEGORY_MESSAGE = 'selected channel is not a category';
/** Discord API 오류 코드 — unknown channel / missing access */
const DISCORD_UNKNOWN_CHANNEL = 10003;
const DISCORD_MISSING_ACCESS = 50001;
const DISCORD_MISSING_PERMISSIONS = 50013;

/** 처리 흐름의 실패를 한국어 안내로 바꿔요 — 사용자가 고칠 수 있는 행동별로 구분해요 */
function toKoreanError(error: unknown): string {
	if (error instanceof Error && error.message.includes(NOT_CATEGORY_MESSAGE)) {
		return `${emoji('error')} 카테고리 채널만 선택할 수 있어요.`;
	}
	if (error instanceof DiscordAPIError) {
		if (error.code === DISCORD_UNKNOWN_CHANNEL) return `${emoji('error')} 채널을 찾을 수 없어요.`;
		if (error.code === DISCORD_MISSING_ACCESS || error.code === DISCORD_MISSING_PERMISSIONS) {
			return `${emoji('error')} 채널 생성·이동 권한이 봇에 없어요. 서버 설정에서 봇 역할 권한을 확인해 주세요.`;
		}
	}
	return `${emoji('error')} 마커 채널을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.`;
}

export class JtcSetupResponder {
	private subscriber: ManagedRedisSubscriber | null = null;
	private readonly inFlight = new Set<string>();

	public constructor(
		private readonly logger: { info(msg: string): void; warn(msg: string): void; error(msg: string): void; debug(msg: string): void }
	) {}

	/**
	 * 구독을 시작해요. 실패해도 throw하지 않아요 — 대시보드 JTC 설정 요청만 타임아웃 폴백으로 끝나고,
	 * 전용 구독 관리자가 자체 백오프(5s→60s)로 재연결을 시도해요.
	 */
	public async start(redisUrl: string | undefined): Promise<void> {
		const url = redisUrl?.trim() || null;
		if (!url) {
			this.logger.warn('REDIS_URL 미설정: JTC 셋업 응답 없이 동작해요 (대시보드 마커 채널 설정은 타임아웃 폴백해요)');
			return;
		}
		this.subscriber = new ManagedRedisSubscriber({
			name: 'JTC 셋업',
			url,
			logger: this.logger,
			bindings: [{ channel: JTC_SETUP_REQUEST_CHANNEL, onMessage: (raw) => void this.handleRequest(raw) }]
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
			this.logger.debug(`JTC 셋업 요청이 JSON이 아니어서 무시: ${raw.slice(0, 100)}`);
			return;
		}
		const request = jtcSetupRequestSchema.safeParse(payload);
		if (!request.success) {
			this.logger.debug(`JTC 셋업 요청 페이로드 형식 불일치, 무시: ${raw.slice(0, 100)}`);
			return;
		}
		const guild = container.client.guilds.cache.get(request.data.guildId);
		if (!guild) return; // 다른 레플리카가 보유한 길드 — 그쪽이 응답해요 (아무도 없으면 data-api 타임아웃)

		const { guildId } = request.data;
		if (this.inFlight.has(guildId)) {
			this.respond({
				requestId: request.data.requestId,
				guildId,
				error: `${emoji('bulb')} 이 서버의 이전 마커 채널 설정 요청을 아직 처리하고 있어요. 잠시 후 다시 시도해 주세요.`
			});
			return;
		}

		this.inFlight.add(guildId);
		try {
			const markerChannelId = await container.tempVoiceService.setupMarkerChannel(guildId, request.data.categoryId);
			this.respond({ requestId: request.data.requestId, guildId, markerChannelId });
		} catch (error) {
			this.logger.error(
				`JTC 마커 채널 셋업 실패 (guild ${guildId}, category ${request.data.categoryId}): ${error instanceof Error ? error.message : String(error)}`
			);
			this.respond({ requestId: request.data.requestId, guildId, error: toKoreanError(error) });
		} finally {
			this.inFlight.delete(guildId);
		}
	}

	/** 응답을 RESPONSE 채널로 퍼블리시해요 (redisStore 없으면 로그만 남겨요) */
	private respond(response: JtcSetupResponse): void {
		const store = container.redisStore;
		if (!store) {
			this.logger.warn(`JTC 셋업 응답을 위한 redisStore가 없어요 (guild ${response.guildId})`);
			return;
		}
		store.publishJtcSetupResponse(JSON.stringify(response));
	}
}
