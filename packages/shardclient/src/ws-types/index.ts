import { z } from "zod";

// WebSocket operation enum
export enum WsOp {
  HELLO = "HELLO",
  PING = "PING",
  MESSAGE = "MESSAGE",
  BROADCASTEVAL = "BROADCASTEVAL",
}

// WebSocket message interface
export interface WsMessage<T = unknown> {
  op: WsOp;
  payload: T;
}

// Hello payload schema
export const HelloPayloadSchema = z.object({
  msg: z.string(),
});

// Hello payload type
export type HelloPayload = z.infer<typeof HelloPayloadSchema>;

// WebSocket message schema
export const WsMessageSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal(WsOp.HELLO), payload: HelloPayloadSchema }),
  z.object({ op: z.literal(WsOp.PING), payload: z.object({}) }),
  z.object({
    op: z.literal(WsOp.MESSAGE),
    payload: z.object({ text: z.string() }),
  }),
  z.object({
    op: z.literal(WsOp.BROADCASTEVAL),
    payload: z.object({ text: z.string() }),
  }),
]);
