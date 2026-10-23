import { z } from 'zod';

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

export const IdentifyPayloadSchema = z.object({
	token: z.string(), // Auth token for verification
	shardIds: z.array(z.number()).optional(), // Existing shard IDs for re-identification
	hostname: z.string().optional() // Container/process hostname
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
	shardIds: z.array(z.number())
});

export type ShardStatusPayload = z.infer<typeof ShardStatusPayloadSchema>;

export const ShardStatsPayloadSchema = z.object({
	shardIds: z.array(z.number()),
	guilds: z.number(),
	players: z.number(),
	memoryUsage: z.number(),
	uptime: z.number()
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
