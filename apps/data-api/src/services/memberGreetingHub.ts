/**
 * 멤버 인사 테스트 전송 결과 허브 — 봇 샤드들이 Redis Pub/Sub
 * (`sirubot:member-greeting:state:{guildId}`)으로 퍼블리시한 테스트 전송 결과를
 * 구독해 길드별 마지막 결과만 인메모리에 보관해요.
 *
 * - 구독자는 data-api가 유일해요 (봇이 퍼블리셔).
 * - botProfileHub와 같은 구조예요 — 대시보드가 send 응답의 requestId를 갖고 이 허브를 폴링해요.
 * - 결과는 requestId로 매칭해요 — 마지막 결과가 이전 테스트의 것일 수 있어요 (폴링 쪽 책임).
 */
import { z } from 'zod';
import { MEMBER_GREETING_STATE_CHANNEL_PREFIX } from '@sirubot/utils';
import { resolveRedisSigningKey, unwrapRedisMessage } from '@sirubot/utils/redisEnvelope';

import { getLogger } from '../utils/logger.ts';
import { HubSubscriber } from '../utils/hubSubscriber.ts';

const logger = getLogger('memberGreetingHub');

/** 길드 상태 엔트리 최대 보관 수 (장기 비활성 길드 누수 방지) */
const MAX_ENTRIES = 5_000;
/** 구독 채널 패턴 — 봇 퍼블리셔와 계약이에요 */
const CHANNEL_PATTERN = `${MEMBER_GREETING_STATE_CHANNEL_PREFIX}*`;

/**
 * 봇이 state 채널로 퍼블리시하는 테스트 전송 결과 — 봇의 MemberGreetingTestState와 같은 계약이에요.
 * sentAt은 epoch milliseconds(number)가 계약이에요 — 레거시 ISO 문자열은 number로 정규화하고,
 * 없거나 깨졌으면 수신 시각으로 대체해요 (값 타입이 이상해도 결과 전체를 버리지 않게).
 */
export const memberGreetingTestStateSchema = z.object({
	requestId: z.string().min(1).max(64),
	kind: z.enum(['welcome', 'goodbye']),
	ok: z.boolean(),
	/** 실패 사유 — 봇이 실패 때만 담고, 없으면 null이에요 */
	error: z.string().nullable().default(null),
	sentAt: z
		.union([
			z.number(),
			z.string().transform((value, ctx) => {
				const at = Date.parse(value);
				if (Number.isNaN(at)) {
					ctx.addIssue({ code: 'custom', message: 'ISO8601 날짜 형식이 아니에요' });
					return z.NEVER;
				}
				return at;
			})
		])
		.catch(() => Date.now())
});
export type GreetingTestResult = z.infer<typeof memberGreetingTestStateSchema>;

/** 보관 단위 — 용량 상한 도달 시 갱신 도착 순과 무관하게 가장 오래 도착한 엔트리부터 비워요 */
interface Entry {
	result: GreetingTestResult;
	receivedAt: number;
}

function parsePayload(message: string): GreetingTestResult | null {
	try {
		const result = memberGreetingTestStateSchema.safeParse(JSON.parse(message));
		if (!result.success) {
			logger.debug(`Malformed member greeting state: ${result.error.issues[0]?.message ?? 'invalid shape'}`);
			return null;
		}
		return result.data;
	} catch (error) {
		logger.debug(`Malformed member greeting state: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

const results = new Map<string, Entry>();

/**
 * Pub/Sub 메시지 처리 — 서명 검증(SEC-006) 후 결과를 길드별로 보관해요.
 * 유닛 테스트가 직접 호출할 수 있게 내보내요 (다루는 게 모듈 results 맵뿐이라 Redis 연결 없이도 검증돼요).
 */
export function handleMemberGreetingStateMessage(message: string, channel: string): void {
	if (!channel.startsWith(MEMBER_GREETING_STATE_CHANNEL_PREFIX)) return;
	const guildId = channel.slice(MEMBER_GREETING_STATE_CHANNEL_PREFIX.length);
	if (!guildId) return;

	// 서명 키는 REDIS_AUTH_KEY ?? AUTH_KEY (봇과 공유). 매 메시지마다 읽어 테스트에서 환경을 스왑할 수 있게 해요.
	// 키가 있는 환경에서는 서명 봉투를 검증해 무서명 위조 프레임을 거부해요 (SEC-006, guildDataHub와 동일 계약).
	const body = unwrapRedisMessage(resolveRedisSigningKey(process.env), message);
	if (body === null) {
		logger.warn(`Rejected member greeting state from ${channel} with invalid signature`);
		return;
	}

	const payload = parsePayload(body);
	if (!payload) return;

	if (results.size >= MAX_ENTRIES && !results.has(guildId)) {
		// 정확한 LRU는 아니지만 가장 오래 도착한 엔트리를 비우면 충분해요.
		const oldest = [...results.entries()].sort((a, b) => a[1].receivedAt - b[1].receivedAt)[0];
		if (oldest) results.delete(oldest[0]);
	}

	results.set(guildId, { result: payload, receivedAt: Date.now() });
}

/** Pub/Sub 구독자 — 공용 라이프사이클(HubSubscriber)에 연결·구독·재시도·종료를 위임해요. */
const subscriber = new HubSubscriber({
	name: 'member greeting hub',
	channel: CHANNEL_PATTERN,
	pattern: true,
	onMessage: handleMemberGreetingStateMessage,
	logger
});

/**
 * Pub/Sub 구독자 연결을 시작해요.
 * REDIS_URL이 없으면 구독 없이 인메모리만 유지해요 (테스트 결과는 항상 없는 셈).
 */
export async function startMemberGreetingHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, member greeting hub will not receive test results');
		return;
	}
	await subscriber.start(redisUrl);
}

export async function stopMemberGreetingHub(): Promise<void> {
	await subscriber.stop();
}

/** 길드별 마지막 테스트 전송 결과 — 없으면 found:false (대시보드가 requestId로 매칭해요) */
export function getGreetingTestResult(guildId: string): { found: false } | ({ found: true } & GreetingTestResult) {
	const entry = results.get(guildId);
	if (!entry) return { found: false };
	return { found: true, ...entry.result };
}

/** 관제용 — 현재 보관 중인 길드 수와 실제 구독 상태 */
export function memberGreetingHubStatus(): { guilds: number; subscribed: boolean } {
	return { guilds: results.size, subscribed: subscriber.isSubscribed };
}
