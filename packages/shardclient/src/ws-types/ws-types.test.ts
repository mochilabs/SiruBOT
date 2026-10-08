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

	it('rejects a BROADCASTEVAL with a non-string script (malicious payload guard)', () => {
		expect(() => WsMessageSchema.parse({ op: 'BROADCASTEVAL', payload: { id: '1', script: 12_345 } })).toThrow();
	});

	it('rejects non-object input', () => {
		expect(() => WsMessageSchema.parse(null)).toThrow();
		expect(() => WsMessageSchema.parse('not-an-object')).toThrow();
	});
});
