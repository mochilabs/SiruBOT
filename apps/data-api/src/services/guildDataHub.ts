/**
 * 길드 데이터(채널·역할 목록) request/reply 허브 — 봇이 보유한 길드의 캐시를 requestId로 상관해 내려줘요.
 *
 * - 대시보드는 사용자 토큰으로 Discord API를 직접 호출하면 401이 나므로 봇 권한으로 우회해요.
 * - requestGuildData()가 REQUEST 채널(`sirubot:guild-data:request`)로 요청을 퍼블리시하면,
 *   해당 길드를 보유한 봇 프로세스(전용 구독자)가 RESPONSE 채널(`sirubot:guild-data:response`)로 응답해요.
 * - 이 허브는 RESPONSE 채널을 구독해 requestId로 대기 중 요청을 resolve해요. 응답이 없으면
 *   (봇이 이 길드를 보유하지 않거나 미연결) 타임아웃으로 동일하게 실패해요.
 * - REQUEST 퍼블리시는 sharedCache 클라이언트로 해요 (invalidate/bot-profile 라우트와 같은 방식).
 * - RESPONSE 구독은 pub/sub 전용 연결이 필요하므로 playerHub와 같은 연결 라이프사이클을 따라요.
 */
import { createClient, type RedisClientType } from '@redis/client';
import { sharedCache } from '../utils/cache.ts';
import { getLogger } from '../utils/logger.ts';
import {
	GUILD_DATA_REQUEST_CHANNEL,
	GUILD_DATA_RESPONSE_CHANNEL,
	guildDataResponseSchema,
	type GuildChannelItem,
	type GuildDataKind,
	type GuildDataRequest,
	type GuildDataResponse,
	type GuildRoleItem
} from '@sirubot/utils';

const logger = getLogger('guildDataHub');

/** 봇 응답 대기 타임아웃 — 봇 미보유·미연결과 응답 없음은 같은 실패로 매핑해요 */
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
/** 동시 대기 요청 상한 — 응답을 못 받는 요청이 pending map에 쌓이는 누수를 방지해요 */
const PENDING_LIMIT = 200;
/** 최초 연결 실패 재시도 백오프 — 1초부터 2배씩, 상한 5초 (playerHub와 같음) */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 5_000;

export type GuildDataFailureReason = 'redis_unavailable' | 'timeout';
export type GuildDataResult = { ok: true; channels?: GuildChannelItem[]; roles?: GuildRoleItem[] } | { ok: false; reason: GuildDataFailureReason };

interface PendingEntry {
	requestId: string;
	guildId: string;
	kind: GuildDataKind;
	resolve: (result: GuildDataResult) => void;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * requestId별 대기 요청 레지스트리 — 용량 상한·타임아웃·응답 상관 로직만 담당해요.
 * Redis I/O와 연결 상태를 몰라서 순수하게 유닛 테스트할 수 있어요.
 */
export class GuildDataPendingRequests {
	private readonly entries = new Map<string, PendingEntry>();

	public constructor(private readonly capacity: number) {}

	public get size(): number {
		return this.entries.size;
	}

	/**
	 * 요청을 등록하고 응답 대기 Promise를 반환해요. 용량이 가득 차면 등록하지 않고
	 * 즉시 timeout 실패로 resolve해요 (봇 응답 없음과 동일 매핑 — 새 요청이 pending을 밀어내지 않아요).
	 */
	public register(requestId: string, guildId: string, kind: GuildDataKind, timeoutMs: number): Promise<GuildDataResult> {
		if (this.entries.size >= this.capacity) {
			logger.warn(`Guild data pending limit reached (${this.capacity}), failing request ${requestId} immediately`);
			return Promise.resolve({ ok: false, reason: 'timeout' });
		}
		let resolve!: (result: GuildDataResult) => void;
		const promise = new Promise<GuildDataResult>((res) => {
			resolve = res;
		});
		const entry: PendingEntry = {
			requestId,
			guildId,
			kind,
			resolve,
			timer: setTimeout(() => {
				this.entries.delete(requestId);
				resolve({ ok: false, reason: 'timeout' });
			}, timeoutMs)
		};
		this.entries.set(requestId, entry);
		return promise;
	}

	/**
	 * RESPONSE 채널 raw 메시지를 상관해요. requestId로 대기 중 요청을 찾아 resolve하고,
	 * 그 외(잘못된 본문, 대기 중이 아닌 requestId, guildId·kind 불일치)는 무시해요.
	 */
	public handleRaw(raw: string): 'resolved' | 'unmatched' | 'malformed' {
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			logger.debug(`Malformed guild data response (not JSON): ${raw.slice(0, 120)}`);
			return 'malformed';
		}
		const result = guildDataResponseSchema.safeParse(parsed);
		if (!result.success) {
			logger.debug(`Malformed guild data response: ${result.error.issues[0]?.message ?? 'invalid shape'}`);
			return 'malformed';
		}
		const response: GuildDataResponse = result.data;
		const entry = this.entries.get(response.requestId);
		if (!entry) return 'unmatched';
		// requestId가 일치해도 guildId·kind가 다르면 왔던 응답 뒤에 다른 요청의 것이 섞인 경우 — resolve하지 않고 타임아웃으로 회수돼요.
		if (response.guildId !== entry.guildId || response.kind !== entry.kind) {
			logger.debug(`Ignored guild data response ${response.requestId} — guildId/kind mismatch`);
			return 'unmatched';
		}
		clearTimeout(entry.timer);
		this.entries.delete(response.requestId);
		if (response.error) {
			// 봇이 데이터를 못 꺼낸 경우 — 성공으로 보면 안 되고 실패 이유는 timeout(bot_timeout) 매핑이 유일해요.
			logger.debug(`Guild data response ${response.requestId} carried error: ${response.error}`);
			entry.resolve({ ok: false, reason: 'timeout' });
			return 'resolved';
		}
		entry.resolve({ ok: true, channels: response.channels, roles: response.roles });
		return 'resolved';
	}

	/** publish 실패 등 응답이 절대 오지 않게 된 요청을 즉시 실패로 정리해요. */
	public fail(requestId: string, reason: GuildDataFailureReason): void {
		const entry = this.entries.get(requestId);
		if (!entry) return;
		clearTimeout(entry.timer);
		this.entries.delete(requestId);
		entry.resolve({ ok: false, reason });
	}
}

const pending = new GuildDataPendingRequests(PENDING_LIMIT);

let subscriber: RedisClientType | null = null;
/** subscribe가 한 번이라도 완료됐는가 — 재연결 시 클라이언트가 자동 재구독하는 대상이 되는 기준 (playerHub와 같은 래치) */
let subscribeIntent = false;
/** 실제 구독 중 — 소켓 isOpen이 아니라 subscribe/재구독 완료 기준이에요 */
let subscribed = false;
/** stopGuildDataHub 이후 백그라운드 재시도 루프가 다시 돌지 않게 하는 래치 */
let stopped = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 연결 + 구독 1회 시도. 실패 시 지연 재시도해요 — 최초 연결 실패로 영구 미구독(재시작 필요) 상태가 되지 않게 해요.
 * (playerHub와 같은 연결 라이프사이클 — @redis/client v5 자동 재연결 + resubscribe 위임)
 */
async function attemptConnect(redisUrl: string, attempt: number): Promise<void> {
	if (stopped) return;
	const base = sharedCache.getClient();
	const client = (base ? base.duplicate() : createClient({ url: redisUrl })) as RedisClientType;
	subscriber = client;
	client.on('error', (error) => {
		subscribed = false;
		logger.error(`guild data hub subscriber error: ${error}`);
	});
	client.on('reconnecting', () => (subscribed = false));
	client.on('end', () => (subscribed = false));
	client.on('ready', () => (subscribed = subscribeIntent));

	try {
		await client.connect();
		await client.subscribe(GUILD_DATA_RESPONSE_CHANNEL, (message) => pending.handleRaw(message));
		subscribeIntent = true;
		subscribed = true;
		logger.info(`Guild data hub subscribed to ${GUILD_DATA_RESPONSE_CHANNEL}`);
	} catch (error) {
		if (stopped) return;
		subscribed = false;
		subscribeIntent = false;
		subscriber = null;
		if (client.isOpen) client.destroy();
		const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
		logger.warn(`Guild data hub subscription failed (attempt ${attempt + 1}), retrying in ${delay}ms: ${error}`);
		retryTimer = setTimeout(() => {
			retryTimer = null;
			void attemptConnect(redisUrl, attempt + 1);
		}, delay);
	}
}

/**
 * RESPONSE 채널 구독자 연결을 시작해요. sharedCache 클라이언트를 duplicate해요 (RESP2 전용 연결 필요).
 * REDIS_URL이 없으면 구독 없이 시작해요 — 요청은 redis_unavailable로 즉시 실패해요 (playerHub 선례).
 */
export async function startGuildDataHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, guild data hub will not receive responses (all requests fail as redis_unavailable)');
		return;
	}
	stopped = false;
	void attemptConnect(redisUrl, 0);
}

export async function stopGuildDataHub(): Promise<void> {
	stopped = true;
	if (retryTimer) {
		clearTimeout(retryTimer);
		retryTimer = null;
	}
	subscribeIntent = false;
	subscribed = false;
	if (!subscriber) return;
	const client = subscriber;
	subscriber = null;
	if (client.isReady) {
		await client.unsubscribe(GUILD_DATA_RESPONSE_CHANNEL).catch(() => undefined);
		await client.quit().catch(() => undefined);
	} else if (client.isOpen) {
		// 연결 도중엔 quit(QUIT 왕복 대기)이 멈출 수 있어 소켓을 즉시 파괴해요
		client.destroy();
	}
}

/**
 * 길드 데이터를 봇에 요청해요. Redis 클라이언트가 없으면 즉시 redis_unavailable, REQUEST 채널을
 * 퍼블리시하고 `timeoutMs`(기본 5초) 안에 응답이 없으면 timeout으로 실패해요.
 * 봇은 보유 길드에만 응답하므로 응답 없음은 봇 미보유·미연결과 같은 실패로 매핑돼요.
 */
export async function requestGuildData(guildId: string, kind: GuildDataKind, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<GuildDataResult> {
	const client = sharedCache.getClient();
	if (!client) {
		return { ok: false, reason: 'redis_unavailable' };
	}
	const requestId = crypto.randomUUID();
	const request: GuildDataRequest = { requestId, guildId, kind };
	const promise = pending.register(requestId, guildId, kind, timeoutMs);
	try {
		await client.publish(GUILD_DATA_REQUEST_CHANNEL, JSON.stringify(request));
	} catch (error) {
		pending.fail(requestId, 'redis_unavailable');
		logger.warn(`Guild data request publish failed (${guildId}): ${error instanceof Error ? error.message : String(error)}`);
	}
	return promise;
}

/** 관제용 — 대기 중 요청 수와 실제 구독 상태 (소켓이 아니라 subscribe/재구독 완료 기준) */
export function guildDataHubStatus(): { pending: number; subscribed: boolean } {
	return { pending: pending.size, subscribed };
}
