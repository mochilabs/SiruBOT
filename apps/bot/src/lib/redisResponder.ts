import { pickRpcCorrelation, type RedisEventContract, type RedisRpcContract, type RedisRpcRequest, type RedisRpcResponse } from '@sirubot/utils';
import { unwrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import type { Guild } from 'discord.js';
import type { z } from 'zod';
import { AppError, plainUserMessage } from './appError.ts';
import { inGuildTheme } from './guildThemeScope.ts';
import type { RedisLogger, RedisPublisher } from './redisPublisher.ts';

export interface RedisRuntime {
	logger: RedisLogger;
	signingKey: string;
	publisher: Pick<RedisPublisher, 'publish'>;
	resolveGuild: (guildId: string) => Guild | undefined;
}

export interface RedisBinding {
	readonly name: string;
	readonly channel: string;
	handle(raw: string, runtime: RedisRuntime): Promise<void>;
}

export const DEFAULT_RESPONDER_ERROR_MESSAGE = '처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';

export interface RedisResponderOptions<TRequest> {
	errorMessage?: string | ((request: TRequest, error: unknown) => string);
}

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

export type RedisResponderHandler<TContract extends RedisRpcContract> = (
	context: RedisResponderContext<RedisRpcRequest<TContract>>
) => Promise<RedisRpcPayload<TContract> | null>;

export type RedisGlobalResponderHandler<TContract extends RedisRpcContract> = (
	context: RedisGlobalResponderContext<RedisRpcRequest<TContract>>
) => Promise<RedisRpcPayload<TContract> | null>;

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
				if (requiresGuild && !runtime.resolveGuild((request as unknown as { guildId: string }).guildId)) return;

				const correlation = pickRpcCorrelation(request);
				const respond = (body: object) => runtime.publisher.publish(contract.responseChannel, { ...correlation, ...body }, label);
				try {
					const payload = await run(request, runtime);
					if (payload) respond(payload);
				} catch (error) {
					if (error instanceof AppError) {
						respond({ error: plainUserMessage(error), ...(error.code ? { code: error.code } : {}) });
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
			// 대시보드 요청 응답도 서버 테마를 따라가도록 맥락을 열어요.
			return inGuildTheme(guild?.id, () => handler({ guild, request, logger: runtime.logger }));
		},
		true
	);
}

export function createGlobalRedisResponder<TContract extends RedisRpcContract>(
	contract: TContract,
	handler: RedisGlobalResponderHandler<TContract>,
	options: RedisResponderOptions<RedisRpcRequest<TContract>> = {}
): RedisBinding {
	return buildResponder(contract, options, (request, runtime) => handler({ request, logger: runtime.logger }), false);
}

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
