/**
 * Redis pub/sub 수신 팩토리 — 응답자(request/reply)와 단방향 이벤트 리스너가 반복하던 골격을 한 곳에 모아요.
 *
 * 응답자(createRedisResponder / createGlobalRedisResponder)가 맡는 일:
 *   서명 검증 → JSON 파싱 → 스키마 검증 → (길드 응답자) 이 프로세스가 길드를 보유하는지 확인
 *   → 핸들러 실행 → 응답 퍼블리시. 핸들러는 성공 본문을 돌려주거나 던져요.
 *
 * - 서명 검증·JSON·스키마 실패는 조용히 무시해요 (로그만 남겨요). 보유하지 않은 길드도 조용히 무시해요 —
 *   다른 레플리카가 응답하고, 아무도 응답하지 않으면 요청자(data-api)가 타임아웃으로 처리해요.
 * - 핸들러가 AppError를 던지면 앱 이모지 마크업을 뗀 사용자 문구(plainUserMessage)로 응답해요.
 *   그 밖의 예외는 error 로그를 남기고 일반 안내 문구로 응답해요 (`errorMessage` 옵션으로 응답자별로 바꿀 수 있어요).
 * - 핸들러가 null을 돌려주면 응답하지 않아요 (대표 프로세스만 응답하는 봇 관리자 제어용).
 * - 어떤 경우에도 절대 throw하지 않아요 — 처리 실패는 요청자의 타임아웃 폴백으로 이어져요.
 *
 * 이벤트 리스너(createRedisEventListener)는 응답 없이 서명 검증 → JSON → 스키마 → 핸들러까지만 해요.
 *
 * 응답자/리스너는 런타임 의존(RedisRuntime)을 호출 시점에 받으므로 모듈 레벨에서 만들어 둘 수 있고,
 * 한 ManagedRedisSubscriber(core/redisSubscribers.ts)에 묶여 연결 하나를 공유해요.
 */
import { pickRpcCorrelation, type RedisEventContract, type RedisRpcContract, type RedisRpcRequest, type RedisRpcResponse } from '@sirubot/utils';
import { unwrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import type { Guild } from 'discord.js';
import type { z } from 'zod';
import { AppError, plainUserMessage } from './appError.ts';
import type { RedisLogger, RedisPublisher } from './redisPublisher.ts';

/** 응답자 핸들러가 실제로 쓰는 런타임 의존 — core/botApplication이 한 번 만들어 모든 바인딩에 넘겨요 */
export interface RedisRuntime {
	logger: RedisLogger;
	/** Redis 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY. 비어 있으면 서명 없는 구버전 모드(개발용). */
	signingKey: string;
	publisher: Pick<RedisPublisher, 'publish'>;
	/** 이 프로세스가 보유한 길드만 돌려줘요 — 없으면 undefined */
	resolveGuild: (guildId: string) => Guild | undefined;
}

/** 구독 하나에 묶이는 바인딩 — 채널 하나와 수신 처리 */
export interface RedisBinding {
	/** 로그 접두사 */
	readonly name: string;
	readonly channel: string;
	/** 원문 메시지를 처리해요. 절대 reject하지 않아요 */
	handle(raw: string, runtime: RedisRuntime): Promise<void>;
}

/** 응답자 일반 오류 안내 — 응답자가 따로 정하지 않으면 이 문구로 응답해요 */
export const DEFAULT_RESPONDER_ERROR_MESSAGE = '처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';

export interface RedisResponderOptions<TRequest> {
	/** AppError가 아닌 예외에 대한 응답 문구 — 고정 문자열이나 (요청, 예외)로 정하는 함수. 기본은 DEFAULT_RESPONDER_ERROR_MESSAGE */
	errorMessage?: string | ((request: TRequest, error: unknown) => string);
}

/** 핸들러가 돌려주는 성공 본문 — 상관 필드(requestId·guildId·kind)는 팩토리가 요청에서 채워요 */
export type RedisRpcPayload<TContract extends RedisRpcContract> = Omit<RedisRpcResponse<TContract>, 'requestId' | 'guildId' | 'kind'>;

type GuildRpcContract = RedisRpcContract<z.ZodType<{ guildId: string }>, z.ZodType>;

export interface RedisResponderContext<TRequest> {
	guild: Guild;
	request: TRequest;
	logger: RedisLogger;
}

export interface RedisGlobalResponderContext<TRequest> {
	request: TRequest;
	logger: RedisLogger;
}

/** 길드 응답자 핸들러 — 성공 본문을 돌려주거나(AppError 포함) 던져요. null이면 응답하지 않아요. */
export type RedisResponderHandler<TContract extends RedisRpcContract> = (
	context: RedisResponderContext<RedisRpcRequest<TContract>>
) => Promise<RedisRpcPayload<TContract> | null>;

export type RedisGlobalResponderHandler<TContract extends RedisRpcContract> = (
	context: RedisGlobalResponderContext<RedisRpcRequest<TContract>>
) => Promise<RedisRpcPayload<TContract> | null>;

/** 서명 검증 → JSON 파싱 → 스키마 검증 — 통과하지 못하면 이유를 로그로 남기고 null이에요 */
function parseMessage<TSchema extends z.ZodType>(
	raw: string,
	name: string,
	kind: '요청' | '트리거',
	schema: TSchema,
	signed: boolean,
	runtime: RedisRuntime
): z.output<TSchema> | null {
	const body = signed ? unwrapRedisMessage(runtime.signingKey, raw) : raw;
	if (body === null) {
		runtime.logger.warn(`${name} ${kind} 거부: 서명 검증 실패`);
		return null;
	}
	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		runtime.logger.debug(`${name} ${kind}이 JSON이 아니어서 무시: ${body.slice(0, 100)}`);
		return null;
	}
	const parsed = schema.safeParse(payload);
	if (!parsed.success) {
		runtime.logger.debug(`${name} ${kind} 페이로드 형식 불일치, 무시: ${body.slice(0, 100)}`);
		return null;
	}
	return parsed.data;
}

function errorText(message: RedisResponderOptions<never>['errorMessage'], request: unknown, error: unknown): string {
	if (typeof message === 'function') return (message as (request: unknown, error: unknown) => string)(request, error);
	return message ?? DEFAULT_RESPONDER_ERROR_MESSAGE;
}

function buildResponder<TContract extends RedisRpcContract>(
	contract: TContract,
	options: RedisResponderOptions<RedisRpcRequest<TContract>>,
	run: (request: RedisRpcRequest<TContract>, runtime: RedisRuntime) => Promise<RedisRpcPayload<TContract> | null | undefined>,
	/** 길드 응답자면 보유 여부를 먼저 확인해요 — 보유하지 않으면 핸들러도 응답도 없어요 */
	requiresGuild: boolean
): RedisBinding {
	const label = `${contract.name} 응답`;
	return {
		name: contract.name,
		channel: contract.requestChannel,
		async handle(raw, runtime) {
			try {
				const request = parseMessage(raw, contract.name, '요청', contract.requestSchema, true, runtime) as RedisRpcRequest<TContract> | null;
				if (!request) return;
				if (requiresGuild && !runtime.resolveGuild((request as unknown as { guildId: string }).guildId)) return; // 다른 레플리카가 보유한 길드 — 그쪽이 응답해요

				const correlation = pickRpcCorrelation(request);
				const respond = (body: object) => runtime.publisher.publish(contract.responseChannel, { ...correlation, ...body }, label);
				try {
					const payload = await run(request, runtime);
					if (payload) respond(payload);
				} catch (error) {
					if (error instanceof AppError) {
						respond({ error: plainUserMessage(error) });
						return;
					}
					const where = [correlation.guildId && `guild ${correlation.guildId}`, correlation.kind && `kind ${correlation.kind}`]
						.filter(Boolean)
						.join(', ');
					runtime.logger.error(
						`${contract.name} 요청 처리 실패${where ? ` (${where})` : ''}: ${error instanceof Error ? error.message : String(error)}`
					);
					respond({ error: errorText(options.errorMessage as RedisResponderOptions<never>['errorMessage'], request, error) });
				}
			} catch (error) {
				runtime.logger.error(`${contract.name} 응답자 내부 오류: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	};
}

/**
 * 길드 응답자 — 요청의 guildId를 이 프로세스가 보유할 때만 핸들러를 실행해요.
 * 핸들러는 ctx.guild로 길드를 받고, 성공 본문(상관 필드 제외)을 돌려줘요.
 */
export function createRedisResponder<TContract extends GuildRpcContract>(
	contract: TContract,
	handler: RedisResponderHandler<TContract>,
	options: RedisResponderOptions<RedisRpcRequest<TContract>> = {}
): RedisBinding {
	return buildResponder(
		contract,
		options,
		(request, runtime) => {
			const guild = runtime.resolveGuild((request as unknown as { guildId: string }).guildId) as Guild;
			return handler({ guild, request, logger: runtime.logger });
		},
		true
	);
}

/** 길드 없는 응답자 — 요청에 guildId가 없는 계약(봇 관리자 제어)용이에요. 응답 여부는 핸들러가 정해요(null이면 무응답). */
export function createGlobalRedisResponder<TContract extends RedisRpcContract>(
	contract: TContract,
	handler: RedisGlobalResponderHandler<TContract>,
	options: RedisResponderOptions<RedisRpcRequest<TContract>> = {}
): RedisBinding {
	return buildResponder(contract, options, (request, runtime) => handler({ request, logger: runtime.logger }), false);
}

/**
 * 단방향 이벤트 리스너 — 계약의 signed 설정대로 서명을 검증하고 스키마를 통과한 이벤트만 핸들러에 넘겨요.
 * 핸들러가 던지면 error 로그만 남겨요 (응답이 없으므로 요청자에게 전할 길이 없어요).
 */
export function createRedisEventListener<TContract extends RedisEventContract>(
	contract: TContract,
	handler: (context: { event: z.output<TContract['schema']>; logger: RedisLogger }) => Promise<void> | void
): RedisBinding {
	return {
		name: contract.name,
		channel: contract.channel,
		async handle(raw, runtime) {
			try {
				const event = parseMessage(raw, contract.name, '트리거', contract.schema, contract.signed, runtime) as z.output<
					TContract['schema']
				> | null;
				if (event === null) return;
				await handler({ event, logger: runtime.logger });
			} catch (error) {
				runtime.logger.error(`${contract.name} 처리 실패: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	};
}
