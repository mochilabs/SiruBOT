/**
 * 길드 설정 캐시 무효화 구독자 — 대시보드 저장 → data-api Redis PUBLISH → 봇 캐시 무효화.
 *
 * 대시보드는 Prisma로 DB를 직접 upsert하므로 봇의 GuildService 60초 캐시가 stale해져요.
 * data-api의 내부 엔드포인트가 Redis 채널(`sirubot:guild-settings:invalidate`)로
 * guildId를 브로드캐스트하면, 각 봇 프로세스(샤드 replica마다 1개)가 이 서비스로
 * 구독해 자기 캐시만 무효화해요. 무효화는 guildId만 전달하고 봇이 DB에서 다시 읽어요.
 *
 * - 구독은 RedisStore 공용 연결을 못 쓰므로(구독 모드는 일반 명령 불가) 전용 연결을 만들어요.
 * - 연결 실패/끊김 시에도 봇은 정상 동작해요 — TTL(60초) 폴백이 있고, 재연결을 시도해요.
 * - 절대 프로세스를 크래시시키지 않아요.
 */
import { container } from '@sapphire/framework';
import { GUILD_SETTINGS_INVALIDATE_CHANNEL } from '@sirubot/utils';
import { createClient, type RedisClientType } from '@redis/client';

import { GuildService } from './guildService.ts';

/** 재연결 백오프 시작값/상한 (ms) */
const RECONNECT_DELAY_MS = 5_000;
const RECONNECT_MAX_DELAY_MS = 60_000;

interface InvalidationPayload {
	guildId?: unknown;
}

/** 페이로드 검증 — {"guildId":"<길드 ID>"} 형태만 무효화해요 */
function parseGuildId(raw: string): string | null {
	try {
		const parsed = JSON.parse(raw) as InvalidationPayload;
		if (typeof parsed?.guildId === 'string' && parsed.guildId.length > 0 && parsed.guildId.length <= 32) {
			return parsed.guildId;
		}
	} catch {
		// 형식 불일치 — 조용히 무시 (로그는 호출부에서 남겨요)
	}
	return null;
}

export class GuildSettingsInvalidator {
	private subscriber: RedisClientType | null = null;
	private redisUrl: string | null = null;
	private stopped = false;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectAttempts = 0;
	private guildService: GuildService | null = null;

	public constructor(
		private readonly logger: { info(msg: string): void; warn(msg: string): void; error(msg: string): void; debug(msg: string): void }
	) {}

	/**
	 * 구독을 시작해요. 실패해도 throw하지 않아요 — TTL 폴백으로 동작이 이어지고,
	 * 자체 백오프로 재연결을 시도해요.
	 */
	public async start(redisUrl: string | undefined, guildService: GuildService): Promise<void> {
		this.guildService = guildService;
		this.redisUrl = redisUrl?.trim() || null;
		if (!this.redisUrl) {
			this.logger.warn('REDIS_URL 미설정: 설정 무효화 구독 없이 동작해요 (캐시 TTL 60초 폴백)');
			return;
		}
		// start 자체는 실패를 던지지 않는다 — connect만 여기서 시도하고 나머지는 비동기 재시도.
		await this.connectOnce();
	}

	private async connectOnce(): Promise<void> {
		if (this.stopped || !this.redisUrl) return;
		const previous = this.subscriber;
		try {
			const client = createClient({ url: this.redisUrl }) as RedisClientType;
			client.on('error', (error) => this.logger.warn(`설정 무효화 구독 오류: ${error.message}`));

			// 끊김 → 재연결. node-redis도 자체 재연결을 하지만 end(종료) 이후에는 살아나지 않으므로 안전망을 둔다.
			client.on('end', () => {
				if (this.subscriber === client) {
					this.subscriber = null;
					void this.scheduleReconnect();
				}
			});

			await client.connect();
			await client.subscribe(GUILD_SETTINGS_INVALIDATE_CHANNEL, (raw) => {
				const guildId = parseGuildId(raw);
				if (!guildId) {
					this.logger.debug(`설정 무효화 페이로드 형식 불일치, 무시: ${raw.slice(0, 100)}`);
					return;
				}
				this.guildService?.invalidate(guildId);
				this.logger.debug(`길드 설정 캐시 무효화: ${guildId}`);
			});

			this.subscriber = client;
			this.reconnectAttempts = 0;
			this.logger.info(`길드 설정 무효화 구독 시작: ${GUILD_SETTINGS_INVALIDATE_CHANNEL}`);
		} catch (error) {
			this.subscriber = this.subscriber === previous ? null : this.subscriber;
			this.logger.warn(`설정 무효화 구독 실패, TTL 폴백으로 동작. 재연결 예약: ${error instanceof Error ? error.message : String(error)}`);
			await this.scheduleReconnect();
		} finally {
			// 실패/교체로 버려진 이전 연결을 닫는다 — 소켓 누수 방지.
			if (previous && previous !== this.subscriber) {
				await previous.quit().catch(() => undefined);
			}
		}
	}

	/** 재연결 백오프 — 지수 증가(5s 시작, 60s 상한) */
	private scheduleReconnect(): void {
		if (this.stopped || this.reconnectTimer) return;
		const delay = Math.min(RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_DELAY_MS);
		this.reconnectAttempts++;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			void this.connectOnce();
		}, delay);
	}

	/** 종료 — 구독 해제 후 연결을 닫아요. 호출자(shutdown)는 redisStore.disconnect() 전에 불러야 해요. */
	public async stop(): Promise<void> {
		this.stopped = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		const client = this.subscriber;
		this.subscriber = null;
		if (!client) return;
		await client.unsubscribe(GUILD_SETTINGS_INVALIDATE_CHANNEL).catch(() => undefined);
		await client.quit().catch(() => undefined);
	}
}

/** 프로세스 공용 인스턴스 — bootstrap에서 시작하고 shutdown에서 정리해요 */
export const guildSettingsInvalidator = new GuildSettingsInvalidator({
	info: (msg) => container.logger.info(msg),
	warn: (msg) => container.logger.warn(msg),
	error: (msg) => container.logger.error(msg),
	debug: (msg) => container.logger.debug(msg)
});
