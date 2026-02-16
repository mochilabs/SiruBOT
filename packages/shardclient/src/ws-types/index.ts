import { z } from "zod";

// WebSocket operation enum
export enum WsOp {
  // Connection lifecycle
  HELLO = "HELLO",
  IDENTIFY = "IDENTIFY",
  IDENTIFY_ACK = "IDENTIFY_ACK",

  // Heartbeat
  HEARTBEAT = "HEARTBEAT",
  HEARTBEAT_ACK = "HEARTBEAT_ACK",

  // Shard status
  SHARD_STATUS = "SHARD_STATUS",
  SHARD_STATS = "SHARD_STATS",

  // Communication
  BROADCASTEVAL = "BROADCASTEVAL",
  BROADCASTEVAL_RESULT = "BROADCASTEVAL_RESULT",
}

// WebSocket message interface
export interface WsMessage<T = unknown> {
  op: WsOp;
  payload: T;
}

// --- Payload types ---

export interface HelloPayload {
  shardCount: number;
  shardsPerProcess: number;
  heartbeatInterval: number;
}

export interface IdentifyPayload {
  token: string; // Auth token for verification
}

export interface IdentifyAckPayload {
  shardIds: number[];
  shardCount: number;
}

export interface HeartbeatPayload {
  timestamp: number;
}

export interface HeartbeatAckPayload {
  timestamp: number;
}

export type ShardStatus = "ready" | "connecting" | "disconnected" | "errored";

export interface ShardStatusPayload {
  status: ShardStatus;
  shardIds: number[];
}

export interface ShardStatsPayload {
  shardIds: number[];
  guilds: number;
  players: number;
  memoryUsage: number;
  uptime: number;
}

export interface BroadcastEvalPayload {
  id: string; // Unique request ID
  script: string;
}

export interface BroadcastEvalResultPayload {
  id: string;
  result: unknown;
  error?: string;
}

// --- Zod schemas ---

export const HelloPayloadSchema = z.object({
  shardCount: z.number(),
  shardsPerProcess: z.number(),
  heartbeatInterval: z.number(),
});

export const IdentifyPayloadSchema = z.object({
  token: z.string(),
});

export const IdentifyAckPayloadSchema = z.object({
  shardIds: z.array(z.number()),
  shardCount: z.number(),
});

export const HeartbeatPayloadSchema = z.object({
  timestamp: z.number(),
});

export const ShardStatusPayloadSchema = z.object({
  status: z.enum(["ready", "connecting", "disconnected", "errored"]),
  shardIds: z.array(z.number()),
});

export const ShardStatsPayloadSchema = z.object({
  shardIds: z.array(z.number()),
  guilds: z.number(),
  players: z.number(),
  memoryUsage: z.number(),
  uptime: z.number(),
});

export const BroadcastEvalPayloadSchema = z.object({
  id: z.string(),
  script: z.string(),
});

export const BroadcastEvalResultPayloadSchema = z.object({
  id: z.string(),
  result: z.unknown(),
  error: z.string().optional(),
});

export const WsMessageSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal(WsOp.HELLO), payload: HelloPayloadSchema }),
  z.object({ op: z.literal(WsOp.IDENTIFY), payload: IdentifyPayloadSchema }),
  z.object({
    op: z.literal(WsOp.IDENTIFY_ACK),
    payload: IdentifyAckPayloadSchema,
  }),
  z.object({ op: z.literal(WsOp.HEARTBEAT), payload: HeartbeatPayloadSchema }),
  z.object({
    op: z.literal(WsOp.HEARTBEAT_ACK),
    payload: HeartbeatPayloadSchema,
  }),
  z.object({
    op: z.literal(WsOp.SHARD_STATUS),
    payload: ShardStatusPayloadSchema,
  }),
  z.object({
    op: z.literal(WsOp.SHARD_STATS),
    payload: ShardStatsPayloadSchema,
  }),
  z.object({
    op: z.literal(WsOp.BROADCASTEVAL),
    payload: BroadcastEvalPayloadSchema,
  }),
  z.object({
    op: z.literal(WsOp.BROADCASTEVAL_RESULT),
    payload: BroadcastEvalResultPayloadSchema,
  }),
]);
