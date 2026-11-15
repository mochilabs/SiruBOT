/**
 * request/reply 허브 팩토리 — 대시보드 요청을 봇에 전달하고 RESPONSE 채널 응답을 requestId로 상관하는
 * guildData·playerWeb·jtcSetup·botAdmin·panel 허브의 공통 배선이에요.
 *
 * - 대기 풀·메타맵·서명 키·구독자(HubSubscriber)·start/stop·request(등록 → 퍼블리시 → 실패 정리)를 한 곳에서 조립해요.
 * - 허브마다 다른 부분(채널·스키마·타임아웃·용량·메타 일치 기준·결과 매핑)만 설정으로 받아요.
 * - 응답 상관 흐름은 공용 correlateHubResponse, 대기 풀은 PendingRequestPool, 구독 라이프사이클은 HubSubscriber를 그대로 써요.
 * - 채널 이름·스키마는 @sirubot/utils의 RPC 계약(defineRedisRpc)이에요. 봇 응답자와 같은 계약 객체를 받아 요청·응답 타입이 양쪽에서 맞물려요.
 */
import { PendingRequestPool, type RedisRpcContract, type RedisRpcRequestInput, type RedisRpcResponse } from '@sirubot/utils';
import { resolveRedisSigningKey, unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import type { ILogObj, Logger } from 'tslog';
import type { z } from 'zod';
import { sharedCache } from './cache.ts';
import { correlateHubResponse, type CorrelateOutcome, type CorrelateSchema } from './hubCorrelate.ts';
import { HubSubscriber } from './hubSubscriber.ts';

/** 응답 본문이 requestId를 갖는 RPC 계약 */
export type HubContract = RedisRpcContract<z.ZodType, z.ZodType<{ requestId: string }>>;

export interface RequestReplyHubConfig<TContract extends HubContract, TMeta, TResult> {
	/** 구독자·start 로그에 쓰는 이름 — 'guild data hub' 등 */
	name: string;
	/** 응답 로그 라벨 — 'guild data' 등 ('Rejected {label} response ...', 'Malformed {label} response') */
	label: string;
	/** 메타 불일치 로그의 기준 문구 — 'guildId/kind mismatch' 등 */
	mismatch: string;
	/** publish 실패 로그의 접두 — 'Guild data request' 등 ('{requestLabel} publish failed ({context}): ...') */
	requestLabel: string;
	logger: Logger<ILogObj>;
	/** 채널·요청/응답 스키마 — 봇 응답자가 쓰는 것과 같은 계약 객체 */
	contract: TContract;
	/** 동시 대기 요청 상한 */
	capacity: number;
	/** 응답과 등록 메타가 같은 요청인지 */
	matches: (response: RedisRpcResponse<TContract>, meta: TMeta) => boolean;
	/** 응답 본문을 풀 결과로 매핑 */
	toResult: (response: RedisRpcResponse<TContract>) => TResult;
	/** 대기 시간 초과·용량 초과 즉시 실패 결과 */
	timeoutResult: () => TResult;
	/** Redis 클라이언트 없음·publish 실패 결과 */
	unavailableResult: () => TResult;
}

export interface RequestReplyCall<TContract extends HubContract, TMeta> {
	requestId: string;
	/** REQUEST 채널로 보낼 페이로드 — 계약의 요청 스키마 형태이고, 서명 봉투로 감싸 퍼블리시해요 */
	payload: RedisRpcRequestInput<TContract>;
	/** requestId에 묶어두는 메타 — 응답 대조에 써요 */
	meta: TMeta;
	timeoutMs: number;
	/** publish 실패 로그 괄호 안에 넣을 문맥 — 'guildId' 등 */
	logContext: string;
}

export interface RequestReplyHub<TContract extends HubContract, TMeta, TResult> {
	/** RESPONSE 채널 구독을 시작해요. REDIS_URL이 없으면 구독 없이 경고만 남기고 돌아와요 */
	start(redisUrl: string | undefined): Promise<void>;
	stop(): Promise<void>;
	request(call: RequestReplyCall<TContract, TMeta>): Promise<TResult>;
	/** 응답 상관 — 풀·메타맵을 생략하면 허브 자신의 것을 써요 (유닛 테스트는 자체 풀·맵을 넘겨요) */
	correlate(raw: string, pending?: PendingRequestPool<TResult>, pendingMeta?: Map<string, TMeta>): CorrelateOutcome;
	/** 관제용 — 대기 중 요청 수와 실제 구독 상태 */
	status(): { pending: number; subscribed: boolean };
}

export function createRequestReplyHub<TContract extends HubContract, TMeta, TResult>(
	config: RequestReplyHubConfig<TContract, TMeta, TResult>
): RequestReplyHub<TContract, TMeta, TResult> {
	const { name, label, logger, contract } = config;
	type TResponse = RedisRpcResponse<TContract> & { requestId: string };

	/** requestId별 대기 요청 메타데이터 — 타임아웃 회수(onTimeout)와 상관 완료(correlate)에서 함께 정리해 누수를 막아요 */
	const pendingMeta = new Map<string, TMeta>();

	/** 동시 대기 요청 상한·타임아웃 회수는 공용 풀에 위임해요 — 봇 응답 없음과 타임아웃은 같은 실패로 매핑해요 */
	const pending = new PendingRequestPool<TResult>({
		capacity: config.capacity,
		logger,
		timeoutResult: config.timeoutResult,
		onTimeout: (requestId) => pendingMeta.delete(requestId)
	});

	/** Redis 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY (봇과 공유). 없으면 서명 없는 구버전 모드. */
	const redisSigningKey = resolveRedisSigningKey(process.env);

	const correlate: RequestReplyHub<TContract, TMeta, TResult>['correlate'] = (raw, pool = pending, metaMap = pendingMeta) =>
		correlateHubResponse<TResponse, TMeta, TResult>({
			raw,
			hub: label,
			mismatch: config.mismatch,
			logger,
			schema: contract.responseSchema as CorrelateSchema<TResponse>,
			pending: pool,
			pendingMeta: metaMap,
			matches: config.matches,
			toResult: config.toResult
		});

	/** Pub/Sub 구독자 — 공용 라이프사이클(HubSubscriber)에 연결·구독·재시도·종료를 위임해요. */
	const subscriber = new HubSubscriber({
		name,
		channel: contract.responseChannel,
		// 응답은 서명 검증을 통과한 본문만 상관해요 — Redis에 쓸 수 있는 사람이 보내는 위조 응답을 거부해요 (SEC-006).
		onMessage: (message) => {
			const body = unwrapRedisMessage(redisSigningKey, message);
			if (body === null) {
				logger.warn(`Rejected ${label} response with invalid signature`);
				return;
			}
			correlate(body);
		},
		logger
	});

	return {
		async start(redisUrl) {
			if (!redisUrl) {
				logger.warn(`REDIS_URL is not set, ${name} will not receive responses (all requests fail as redis_unavailable)`);
				return;
			}
			await subscriber.start(redisUrl);
		},
		async stop() {
			await subscriber.stop();
		},
		async request({ requestId, payload, meta, timeoutMs, logContext }) {
			const client = sharedCache.getClient();
			if (!client) {
				return config.unavailableResult();
			}
			// 용량 초과 등 즉시 실패 경로에서도 onTimeout이 메타데이터를 정리할 수 있게 register 전에 심어요
			pendingMeta.set(requestId, meta);
			const promise = pending.register(requestId, timeoutMs);
			try {
				await client.publish(contract.requestChannel, wrapRedisMessage(redisSigningKey, payload));
			} catch (error) {
				// publish 실패 — 응답이 절대 오지 않으니 즉시 실패로 정리해요
				if (pending.fail(requestId, config.unavailableResult())) {
					pendingMeta.delete(requestId);
				}
				logger.warn(`${config.requestLabel} publish failed (${logContext}): ${error instanceof Error ? error.message : String(error)}`);
			}
			return promise;
		},
		correlate,
		status: () => ({ pending: pending.size, subscribed: subscriber.isSubscribed })
	};
}
