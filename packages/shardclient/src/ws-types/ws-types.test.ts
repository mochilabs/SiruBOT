import { describe, expect, it } from 'vitest';
import { WsMessageSchema, WsOp } from './index.ts';

describe('WsMessageSchema', () => {
	it('parses a valid HELLO message', () => {
		const message = WsMessageSchema.parse({
			op: 'HELLO',
			payload: { shardCount: 4, shardsPerProcess: 2, heartbeatInterval: 30_000 }
		});
		expect(message.op).toBe(WsOp.HELLO);
	});

	it('parses a valid HEARTBEAT message', () => {
		const message = WsMessageSchema.parse({ op: 'HEARTBEAT', payload: { timestamp: 1_234_567_890 } });
		expect(message.op).toBe(WsOp.HEARTBEAT);
	});

	it('rejects an unknown op', () => {
		expect(() => WsMessageSchema.parse({ op: 'NOPE', payload: {} })).toThrow();
	});

	it('rejects a message without op', () => {
		expect(() => WsMessageSchema.parse({ payload: {} })).toThrow();
	});

	it('rejects a removed BROADCASTEVAL op (deleted eval pipeline must not come back)', () => {
		expect(() => WsMessageSchema.parse({ op: 'BROADCASTEVAL', payload: { id: '1', script: '1+1' } })).toThrow();
	});

	it('rejects non-object input', () => {
		expect(() => WsMessageSchema.parse(null)).toThrow();
		expect(() => WsMessageSchema.parse('not-an-object')).toThrow();
	});

	it('rejects malformed shard IDs and stats in client-sent payloads', () => {
		const identify = (payload: unknown) => WsMessageSchema.parse({ op: WsOp.IDENTIFY, payload });
		expect(() => identify({ token: 't', shardIds: [1.5] })).toThrow();
		expect(() => identify({ token: 't', shardIds: [-1] })).toThrow();
		expect(() => identify({ token: 't', shardIds: Array.from({ length: 1025 }, (_, i) => i) })).toThrow();
		expect(() => identify({ token: 't', shardIds: [0, 1] })).not.toThrow();

		const stats = (memoryUsage: number) =>
			WsMessageSchema.parse({ op: WsOp.SHARD_STATS, payload: { shardIds: [0], guilds: 1, players: 0, memoryUsage, uptime: 12.5 } });
		expect(() => stats(-1)).toThrow();
		expect(() => stats(1024)).not.toThrow();
	});
});
