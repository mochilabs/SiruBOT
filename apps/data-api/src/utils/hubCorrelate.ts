/**
 * request/reply 허브 응답 상관 공용 흐름: guildData·playerWeb·jtcSetup 세 허브가
 * JSON 파싱 → 스키마 검증 → 메타 대조 → 메타 정리 → 풀 resolve를 같은 순서로 밟아요.
 *
 * - 허브마다 다른 부분(스키마·메타 일치 기준·결과 매핑·로그 라벨)만 인자로 받아요.
 * - Redis I/O와 연결 상태를 몰라 풀·메타맵을 인자로 받으므로 유닛 테스트로 잠그기 쉬워요.
 * - 구독 라이프사이클(HubSubscriber)과 대기 풀(PendingRequestPool)은 이미 분리된 공용 모듈이에요.
 */
import type { PendingRequestPool } from '@sirubot/utils';
import type { ILogObj, Logger } from 'tslog';

export type CorrelateOutcome = 'resolved' | 'unmatched' | 'malformed';

/** zod 스키마가 공급하는 safeParse 형태만 받는 최소 계약 */
export interface CorrelateSchema<TResponse> {
	safeParse(data: unknown): { success: true; data: TResponse } | { success: false; error: { issues: { message?: string }[] } };
}

export interface CorrelateHubOptions<TResponse extends { requestId: string }, TMeta, TResult> {
	/** RESPONSE 채널에서 unwrap한 raw 본문 */
	raw: string;
	/** 로그 라벨: 'guild data' / 'player web' / 'jtc setup' */
	hub: string;
	/** 메타 불일치 로그의 기준 문구: 'guildId/kind mismatch' 등 */
	mismatch: string;
	logger: Logger<ILogObj>;
	schema: CorrelateSchema<TResponse>;
	pending: PendingRequestPool<TResult>;
	pendingMeta: Map<string, TMeta>;
	/** 응답과 등록 메타가 같은 요청인지: guildData·playerWeb은 guildId+kind, jtcSetup은 guildId만 봐요 */
	matches: (response: TResponse, meta: TMeta) => boolean;
	/** 응답 본문을 풀 결과로 매핑: 봇 에러/성공 분기는 허브가 정해요 */
	toResult: (response: TResponse) => TResult;
}

/**
 * RESPONSE 채널 raw 메시지를 대기 중 요청과 상관해요. requestId의 메타데이터와 일치하면 풀을 완료하고,
 * 그 외(잘못된 본문, 대기 중이 아닌 requestId, 불일치)는 무시해요.
 */
export function correlateHubResponse<TResponse extends { requestId: string }, TMeta, TResult>(
	options: CorrelateHubOptions<TResponse, TMeta, TResult>
): CorrelateOutcome {
	const { raw, hub, mismatch, logger, schema, pending, pendingMeta, matches, toResult } = options;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		logger.debug(`Malformed ${hub} response (not JSON): ${raw.slice(0, 120)}`);
		return 'malformed';
	}
	const result = schema.safeParse(parsed);
	if (!result.success) {
		logger.debug(`Malformed ${hub} response: ${result.error.issues[0]?.message ?? 'invalid shape'}`);
		return 'malformed';
	}
	const response = result.data;
	const meta = pendingMeta.get(response.requestId);
	if (!meta) return 'unmatched';
	// requestId가 일치해도 메타가 다르면 다른 요청의 응답이 섞인 경우예요. resolve하지 않고 타임아웃으로 회수돼요.
	if (!matches(response, meta)) {
		logger.debug(`Ignored ${hub} response ${response.requestId}, ${mismatch}`);
		return 'unmatched';
	}
	pendingMeta.delete(response.requestId);
	pending.resolve(response.requestId, toResult(response));
	return 'resolved';
}
