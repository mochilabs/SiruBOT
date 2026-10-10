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
import { GUILD_SETTINGS_INVALIDATE_CHANNEL, ManagedRedisSubscriber } from '@sirubot/utils';

import { GuildService } from './guildService.ts';

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
	private subscriber: ManagedRedisSubscriber | null = null;
	private guildService: GuildService | null = null;

	public constructor(
		private readonly logger: { info(msg: string): void; warn(msg: string): void; error(msg: string): void; debug(msg: string): void }
	) {}

	/**
	 * 구독을 시작해요. 실패해도 throw하지 않아요 — TTL 폴백으로 동작이 이어지고,
	 * 전용 구독 관리자가 자체 백오프(5s→60s)로 재연결을 시도해요.
	 */
	public async start(redisUrl: string | undefined, guildService: GuildService): Promise<void> {
		this.guildService = guildService;
		const url = redisUrl?.trim() || null;
		if (!url) {
			this.logger.warn('REDIS_URL 미설정: 설정 무효화 구독 없이 동작해요 (캐시 TTL 60초 폴백)');
			return;
		}
		// start 자체는 실패를 던지지 않는다 — connect만 여기서 시도하고 나머지는 비동기 재시도.
		this.subscriber = new ManagedRedisSubscriber({
			name: '설정 무효화',
			url,
			logger: this.logger,
			bindings: [{ channel: GUILD_SETTINGS_INVALIDATE_CHANNEL, onMessage: (raw) => this.invalidate(raw) }]
		});
		await this.subscriber.start();
	}

	private invalidate(raw: string): void {
		const guildId = parseGuildId(raw);
		if (!guildId) {
			this.logger.debug(`설정 무효화 페이로드 형식 불일치, 무시: ${raw.slice(0, 100)}`);
			return;
		}
		this.guildService?.invalidate(guildId);
		this.logger.debug(`길드 설정 캐시 무효화: ${guildId}`);
	}

	/** 종료 — 구독 해제 후 연결을 닫아요. 호출자(shutdown)는 redisStore.disconnect() 전에 불러야 해요. */
	public async stop(): Promise<void> {
		const subscriber = this.subscriber;
		this.subscriber = null;
		await subscriber?.stop();
	}
}
