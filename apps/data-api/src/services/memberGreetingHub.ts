/**
 * 멤버 인사 테스트 전송 결과 허브 — 봇 샤드들이 Redis Pub/Sub
 * (`sirubot:member-greeting:state:{guildId}`)으로 퍼블리시한 테스트 전송 결과를
 * 구독해 길드별 마지막 결과만 인메모리에 보관해요.
 *
 * - 구독자는 data-api가 유일해요 (봇이 퍼블리셔).
 * - botProfileHub와 같은 구조예요 — 대시보드가 send 응답의 requestId를 갖고 이 허브를 폴링해요.
 * - 결과는 requestId로 매칭해요 — 마지막 결과가 이전 테스트의 것일 수 있어요 (폴링 쪽 책임).
 */
import { MEMBER_GREETING_STATE_CHANNEL_PREFIX, type GreetingKind } from '@sirubot/utils';

import { getLogger } from '../utils/logger.ts';
import { HubSubscriber } from '../utils/hubSubscriber.ts';

const logger = getLogger('memberGreetingHub');

/** 길드 상태 엔트리 최대 보관 수 (장기 비활성 길드 누수 방지) */
const MAX_ENTRIES = 5_000;
/** 구독 채널 패턴 — 봇 퍼블리셔와 계약이에요 */
const CHANNEL_PATTERN = `${MEMBER_GREETING_STATE_CHANNEL_PREFIX}*`;

/** 봇이 state 채널로 퍼블리시하는 테스트 전송 결과 */
export interface GreetingTestResult {
	requestId: string;
	kind: GreetingKind;
	ok: boolean;
	error: string | null;
	sentAt: number;
}

/** 보관 단위 — 용량 상한 도달 시 갱신 도착 순과 무관하게 가장 오래 도착한 엔트리부터 비워요 */
interface Entry {
	result: GreetingTestResult;
	receivedAt: number;
}

function parsePayload(message: string): GreetingTestResult | null {
	try {
		const parsed = JSON.parse(message) as Partial<GreetingTestResult> & { kind?: unknown };
		if (typeof parsed !== 'object' || parsed === null) return null;
		if (typeof parsed.requestId !== 'string' || parsed.requestId.length < 1 || parsed.requestId.length > 64) return null;
		if (parsed.kind !== 'welcome' && parsed.kind !== 'goodbye') return null;
		if (typeof parsed.ok !== 'boolean') return null;
		if (parsed.error !== undefined && parsed.error !== null && typeof parsed.error !== 'string') return null;
		return {
			requestId: parsed.requestId,
			kind: parsed.kind,
			ok: parsed.ok,
			error: parsed.error ?? null,
			// sentAt은 봇 시각 — 못 받으면 수신 시각으로라도 기록해요
			sentAt: typeof parsed.sentAt === 'number' ? parsed.sentAt : Date.now()
		};
	} catch (error) {
		logger.debug(`Malformed member greeting state: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

const results = new Map<string, Entry>();

function handleMessage(message: string, channel: string): void {
	if (!channel.startsWith(MEMBER_GREETING_STATE_CHANNEL_PREFIX)) return;
	const guildId = channel.slice(MEMBER_GREETING_STATE_CHANNEL_PREFIX.length);
	if (!guildId) return;

	const payload = parsePayload(message);
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
	onMessage: handleMessage,
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
