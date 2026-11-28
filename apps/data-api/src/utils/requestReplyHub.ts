import { PendingRequestPool, type RedisRpcContract, type RedisRpcRequestInput, type RedisRpcResponse } from '@sirubot/utils';
import { resolveRedisSigningKey, unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import type { ILogObj, Logger } from 'tslog';
import type { z } from 'zod';
import { sharedCache } from './cache.ts';
import { correlateHubResponse, type CorrelateOutcome, type CorrelateSchema } from './hubCorrelate.ts';
import { HubSubscriber } from './hubSubscriber.ts';

export type HubContract = RedisRpcContract<z.ZodType, z.ZodType<{ requestId: string }>>;

export interface RequestReplyHubConfig<TContract extends HubContract, TMeta, TResult> {
	name: string;
	label: string;
	mismatch: string;
	requestLabel: string;
	logger: Logger<ILogObj>;
	contract: TContract;
	capacity: number;
	matches: (response: RedisRpcResponse<TContract>, meta: TMeta) => boolean;
	toResult: (response: RedisRpcResponse<TContract>) => TResult;
	timeoutResult: () => TResult;
	unavailableResult: () => TResult;
}

export interface RequestReplyCall<TContract extends HubContract, TMeta> {
	requestId: string;
	payload: RedisRpcRequestInput<TContract>;
	meta: TMeta;
	timeoutMs: number;
	logContext: string;
}

export interface RequestReplyHub<TContract extends HubContract, TMeta, TResult> {
	start(redisUrl: string | undefined): Promise<void>;
	stop(): Promise<void>;
	request(call: RequestReplyCall<TContract, TMeta>): Promise<TResult>;
	correlate(raw: string, pending?: PendingRequestPool<TResult>, pendingMeta?: Map<string, TMeta>): CorrelateOutcome;
	status(): { pending: number; subscribed: boolean };
}

export function createRequestReplyHub<TContract extends HubContract, TMeta, TResult>(
	config: RequestReplyHubConfig<TContract, TMeta, TResult>
): RequestReplyHub<TContract, TMeta, TResult> {
	const { name, label, logger, contract } = config;
	type TResponse = RedisRpcResponse<TContract> & { requestId: string };

	const pendingMeta = new Map<string, TMeta>();

	const pending = new PendingRequestPool<TResult>({
		capacity: config.capacity,
		logger,
		timeoutResult: config.timeoutResult,
		onTimeout: (requestId) => pendingMeta.delete(requestId)
	});

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

	const subscriber = new HubSubscriber({
		name,
		channel: contract.responseChannel,
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
			// Set meta before register so onTimeout can clean up even on immediate capacity failure.
			pendingMeta.set(requestId, meta);
			const promise = pending.register(requestId, timeoutMs);
			try {
				await client.publish(contract.requestChannel, wrapRedisMessage(redisSigningKey, payload));
			} catch (error) {
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
