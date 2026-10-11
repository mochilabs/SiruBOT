/**
 * 웹 플레이어 request/reply 허브 — 대시보드의 검색·재생·제어·음성 상태 요청을 봇에 전달해 응답을 상관해요.
 *
 * - 요청자의 음성 채널과 관리자/DJ 권한은 봇 캐시로만 해석할 수 있으므로 guildData 조회와 같은
 *   request/reply(shape는 @sirubot/utils의 playerWeb 스키마)로 우회해요.
 * - requestPlayerWeb()가 REQUEST 채널(`sirubot:player-web:request`)로 요청을 퍼블리시하면,
 *   해당 길드를 보유한 봇 프로세스(전용 구독자)가 RESPONSE 채널(`sirubot:player-web:response`)로 응답해요.
 * - 이 허브는 RESPONSE 채널을 구독해 requestId로 대기 중 요청을 resolve해요. 응답이 없으면
 *   (봇이 이 길드를 보유하지 않거나 미연결) 타임아웃으로 동일하게 실패해요.
 * - 봇이 error 메시지(한국어)를 실어도 그대로 전달해요 — 실제 실패 사유를 사용자에게 보여줄 수 있어요.
 * - REQUEST 퍼블리시는 sharedCache 클라이언트로 해요 (guildData와 같은 방식).
 * - RESPONSE 구독은 pub/sub 전용 연결이 필요하므로 guildDataHub와 같은 연결 라이프사이클을 따라요.
 */
import { createClient, type RedisClientType } from '@redis/client';
import { sharedCache } from '../utils/cache.ts';
import { getLogger } from '../utils/logger.ts';
import {
	PLAYER_WEB_REQUEST_CHANNEL,
	PLAYER_WEB_RESPONSE_CHANNEL,
	playerWebResponseSchema,
	type PlayerVoiceContext,
	type PlayerWebControlRequest,
	type PlayerWebKind,
	type PlayerWebPlayRequest,
	type PlayerWebSearchRequest,
	type PlayerWebTrack,
	type PlayerWebVoiceContextRequest
} from '@sirubot/utils';

/** kind별 요청의 유니언 — 초과 속성 검사를 만족시키기 위해 라우트가 실제 페이로드 형태를 그대로 전달해요 */
export type PlayerWebAnyRequest = PlayerWebSearchRequest | PlayerWebPlayRequest | PlayerWebControlRequest | PlayerWebVoiceContextRequest;

const logger = getLogger('playerWebHub');

/** kind별 봇 응답 대기 시간 — 검색(노드 왕복)·재생(검색+접속+큐잉)은 제어/상태 조회보다 여유를 둬요 */
const KIND_TIMEOUT_MS: Record<PlayerWebKind, number> = {
	search: 10_000,
	play: 12_000,
	control: 6_000,
	'voice-context': 4_000
};
/** 동시 대기 요청 상한 — 응답을 못 받는 요청이 pending map에 쌓이는 누수를 방지해요 */
const PENDING_LIMIT = 200;
/** 최초 연결 실패 재시도 백오프 — 1초부터 2배씩, 상한 5초 (guildDataHub와 같음) */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 5_000;

export type PlayerWebFailureReason = 'redis_unavailable' | 'timeout' | 'bot_error';
export type PlayerWebResult =
	| { ok: true; tracks?: PlayerWebTrack[]; voice?: PlayerVoiceContext }
	| { ok: false; reason: PlayerWebFailureReason; message: string | null };

interface PendingEntry {
	requestId: string;
	guildId: string;
	kind: PlayerWebKind;
	resolve: (result: PlayerWebResult) => void;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * requestId별 대기 요청 레지스트리 — 용량 상한·타임아웃·응답 상관 로직만 담당해요.
 * Redis I/O와 연결 상태를 몰라서 순수하게 유닛 테스트할 수 있어요 (GuildDataPendingRequests와 같은 형태).
 */
export class PlayerWebPendingRequests {
	private readonly entries = new Map<string, PendingEntry>();

	public constructor(private readonly capacity: number) {}

	public get size(): number {
		return this.entries.size;
	}

	/**
	 * 요청을 등록하고 응답 대기 Promise를 반환해요. 용량이 가득 차면 등록하지 않고
	 * 즉시 timeout 실패로 resolve해요 (봇 응답 없음과 동일 매핑 — 새 요청이 pending을 밀어내지 않아요).
	 */
	public register(requestId: string, guildId: string, kind: PlayerWebKind, timeoutMs: number): Promise<PlayerWebResult> {
		if (this.entries.size >= this.capacity) {
			logger.warn(`Player web pending limit reached (${this.capacity}), failing request ${requestId} immediately`);
			return Promise.resolve({ ok: false, reason: 'timeout', message: null });
		}
		let resolve!: (result: PlayerWebResult) => void;
		const promise = new Promise<PlayerWebResult>((res) => {
			resolve = res;
		});
		this.entries.set(requestId, {
			requestId,
			guildId,
			kind,
			resolve,
			timer: setTimeout(() => {
				this.entries.delete(requestId);
				resolve({ ok: false, reason: 'timeout', message: null });
			}, timeoutMs)
		});
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
			logger.debug(`Malformed player web response (not JSON): ${raw.slice(0, 120)}`);
			return 'malformed';
		}
		const result = playerWebResponseSchema.safeParse(parsed);
		if (!result.success) {
			logger.debug(`Malformed player web response: ${result.error.issues[0]?.message ?? 'invalid shape'}`);
			return 'malformed';
		}
		const response = result.data;
		const entry = this.entries.get(response.requestId);
		if (!entry) return 'unmatched';
		// requestId가 일치해도 guildId·kind가 다르면 왔던 응답 뒤에 다른 요청의 것이 섞인 경우 — resolve하지 않고 타임아웃으로 회수돼요.
		if (response.guildId !== entry.guildId || response.kind !== entry.kind) {
			logger.debug(`Ignored player web response ${response.requestId} — guildId/kind mismatch`);
			return 'unmatched';
		}
		clearTimeout(entry.timer);
		this.entries.delete(response.requestId);
		if (response.error) {
			// 봇이 검증 실패(음성 미접속·권한 없음·노드 없음 등)를 한국어로 실어 보낸 경우 — 실제 사유를 그대로 전달해요.
			entry.resolve({ ok: false, reason: 'bot_error', message: response.error });
			return 'resolved';
		}
		entry.resolve({ ok: true, tracks: response.tracks, voice: response.voice });
		return 'resolved';
	}

	/** publish 실패 등 응답이 절대 오지 않게 된 요청을 즉시 실패로 정리해요. */
	public fail(requestId: string, reason: PlayerWebFailureReason): void {
		const entry = this.entries.get(requestId);
		if (!entry) return;
		clearTimeout(entry.timer);
		this.entries.delete(requestId);
		entry.resolve({ ok: false, reason, message: null });
	}
}

const pending = new PlayerWebPendingRequests(PENDING_LIMIT);

let subscriber: RedisClientType | null = null;
/** subscribe가 한 번이라도 완료됐는가 — 재연결 시 클라이언트가 자동 재구독하는 대상이 되는 기준 (guildDataHub와 같은 래치) */
let subscribeIntent = false;
/** 실제 구독 중 — 소켓 isOpen이 아니라 subscribe/재구독 완료 기준이에요 */
let subscribed = false;
/** stopPlayerWebHub 이후 백그라운드 재시도 루프가 다시 돌지 않게 하는 래치 */
let stopped = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 연결 + 구독 1회 시도. 실패 시 지연 재시도해요 — 최초 연결 실패로 영구 미구독(재시작 필요) 상태가 되지 않게 해요.
 * (guildDataHub와 같은 연결 라이프사이클 — @redis/client v5 자동 재연결 + resubscribe 위임)
 */
async function attemptConnect(redisUrl: string, attempt: number): Promise<void> {
	if (stopped) return;
	const base = sharedCache.getClient();
	const client = (base ? base.duplicate() : createClient({ url: redisUrl })) as RedisClientType;
	subscriber = client;
	client.on('error', (error) => {
		subscribed = false;
		logger.error(`player web hub subscriber error: ${error}`);
	});
	client.on('reconnecting', () => (subscribed = false));
	client.on('end', () => (subscribed = false));
	client.on('ready', () => (subscribed = subscribeIntent));

	try {
		await client.connect();
		await client.subscribe(PLAYER_WEB_RESPONSE_CHANNEL, (message) => pending.handleRaw(message));
		subscribeIntent = true;
		subscribed = true;
		logger.info(`Player web hub subscribed to ${PLAYER_WEB_RESPONSE_CHANNEL}`);
	} catch (error) {
		if (stopped) return;
		subscribed = false;
		subscribeIntent = false;
		subscriber = null;
		if (client.isOpen) client.destroy();
		const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
		logger.warn(`Player web hub subscription failed (attempt ${attempt + 1}), retrying in ${delay}ms: ${error}`);
		retryTimer = setTimeout(() => {
			retryTimer = null;
			void attemptConnect(redisUrl, attempt + 1);
		}, delay);
	}
}

/**
 * RESPONSE 채널 구독자 연결을 시작해요. sharedCache 클라이언트를 duplicate해요 (RESP2 전용 연결 필요).
 * REDIS_URL이 없으면 구독 없이 시작해요 — 요청은 redis_unavailable로 즉시 실패해요 (guildDataHub 선례).
 */
export async function startPlayerWebHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, player web hub will not receive responses (all requests fail as redis_unavailable)');
		return;
	}
	stopped = false;
	void attemptConnect(redisUrl, 0);
}

export async function stopPlayerWebHub(): Promise<void> {
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
		await client.unsubscribe(PLAYER_WEB_RESPONSE_CHANNEL).catch(() => undefined);
		await client.quit().catch(() => undefined);
	} else if (client.isOpen) {
		// 연결 도중엔 quit(QUIT 왕복 대기)이 멈출 수 있어 소켓을 즉시 파괴해요
		client.destroy();
	}
}

/**
 * 웹 플레이어 요청을 봇에 전달하고 응답을 기다려요. Redis 클라이언트가 없으면 즉시 redis_unavailable,
 * REQUEST 채널을 퍼블리시하고 kind별 대기 시간 안에 응답이 없으면 timeout으로 실패해요.
 * 봇은 보유 길드에만 응답하므로 응답 없음은 봇 미보유·미연결과 같은 실패로 매핑돼요.
 */
export async function requestPlayerWeb(payload: PlayerWebAnyRequest): Promise<PlayerWebResult> {
	const client = sharedCache.getClient();
	if (!client) {
		return { ok: false, reason: 'redis_unavailable', message: null };
	}
	const promise = pending.register(payload.requestId, payload.guildId, payload.kind, KIND_TIMEOUT_MS[payload.kind]);
	try {
		await client.publish(PLAYER_WEB_REQUEST_CHANNEL, JSON.stringify(payload));
	} catch (error) {
		pending.fail(payload.requestId, 'redis_unavailable');
		logger.warn(
			`Player web request publish failed (${payload.guildId}, kind ${payload.kind}): ${error instanceof Error ? error.message : String(error)}`
		);
	}
	return promise;
}

/** 관제용 — 대기 중 요청 수와 실제 구독 상태 (소켓이 아니라 subscribe/재구독 완료 기준) */
export function playerWebHubStatus(): { pending: number; subscribed: boolean } {
	return { pending: pending.size, subscribed };
}
