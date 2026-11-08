import { z } from 'zod';

const MAX_SHARD_IDS = 1024;

export enum WsOp {
	HELLO = 'HELLO',
	IDENTIFY = 'IDENTIFY',
	IDENTIFY_ACK = 'IDENTIFY_ACK',

	HEARTBEAT = 'HEARTBEAT',
	HEARTBEAT_ACK = 'HEARTBEAT_ACK',

	SHARD_STATUS = 'SHARD_STATUS',
	SHARD_STATS = 'SHARD_STATS'
}

export interface WsMessage<T = unknown> {
	op: WsOp;
	payload: T;
}

// 페이로드 타입은 아래 zod 스키마에서 z.infer로 뽑아요. 계약은 스키마 한 곳만 고치면 돼요.

export const HelloPayloadSchema = z.object({
	shardCount: z.number(),
	shardsPerProcess: z.number(),
	heartbeatInterval: z.number()
});

export type HelloPayload = z.infer<typeof HelloPayloadSchema>;

/** 샤드 ID: 0 이상의 정수. 배열 길이 상한은 비정상 요청을 스키마에서 걸러내요 */
const shardIdSchema = z.number().int().nonnegative();
const shardIdsSchema = z.array(shardIdSchema).max(MAX_SHARD_IDS);

export const IdentifyPayloadSchema = z.object({
	token: z.string(), // Auth token for verification
	shardIds: shardIdsSchema.optional(), // Existing shard IDs for re-identification
	hostname: z.string().max(255).optional() // Container/process hostname
});

export type IdentifyPayload = z.infer<typeof IdentifyPayloadSchema>;

export const IdentifyAckPayloadSchema = z.object({
	shardIds: z.array(z.number()),
	shardCount: z.number()
});

export type IdentifyAckPayload = z.infer<typeof IdentifyAckPayloadSchema>;

export const HeartbeatPayloadSchema = z.object({
	timestamp: z.number()
});

export type HeartbeatPayload = z.infer<typeof HeartbeatPayloadSchema>;

const shardStatusSchema = z.enum(['ready', 'connecting', 'disconnected', 'errored']);

export type ShardStatus = z.infer<typeof shardStatusSchema>;

export const ShardStatusPayloadSchema = z.object({
	status: shardStatusSchema,
	shardIds: shardIdsSchema
});

export type ShardStatusPayload = z.infer<typeof ShardStatusPayloadSchema>;

export const ShardStatsPayloadSchema = z.object({
	shardIds: shardIdsSchema,
	guilds: z.number().nonnegative(),
	players: z.number().nonnegative(),
	memoryUsage: z.number().nonnegative(),
	uptime: z.number().nonnegative()
});

export type ShardStatsPayload = z.infer<typeof ShardStatsPayloadSchema>;

export const WsMessageSchema = z.discriminatedUnion('op', [
	z.object({ op: z.literal(WsOp.HELLO), payload: HelloPayloadSchema }),
	z.object({ op: z.literal(WsOp.IDENTIFY), payload: IdentifyPayloadSchema }),
	z.object({
		op: z.literal(WsOp.IDENTIFY_ACK),
		payload: IdentifyAckPayloadSchema
	}),
	z.object({ op: z.literal(WsOp.HEARTBEAT), payload: HeartbeatPayloadSchema }),
	z.object({
		op: z.literal(WsOp.HEARTBEAT_ACK),
		payload: HeartbeatPayloadSchema
	}),
	z.object({
		op: z.literal(WsOp.SHARD_STATUS),
		payload: ShardStatusPayloadSchema
	}),
	z.object({
		op: z.literal(WsOp.SHARD_STATS),
		payload: ShardStatsPayloadSchema
	})
]);
