// ShardClient 회귀 계약: IDENTIFY 핸드셰이크, 할당 샤드 없음의 조기 종료(재시도 없음),
// 실패 후 5초 백오프 재시도, ws close 후 재연결·재식별 흐름을 잠가요.
// ShardWebSocket은 목으로 대체해 실제 네트워크 없이 핸들러 등록 순서만 검증해요.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShardClient } from './client.ts';
import { NoShardsAvailableError } from './errors/NoShardsAvailableError.ts';
import type { ILogger } from './types/logger.ts';
import { WsOp } from './ws-types/index.ts';

type Handler = (message: { op: string; payload: unknown }) => void;

type LogLevel = 'info' | 'warn' | 'error';

const wsState = vi.hoisted(() => ({
	handlers: new Map<string, Handler[]>(),
	closeCallback: null as ((code: number, reason: string) => void) | null,
	connectCalls: 0,
	connectFailures: 0,
	terminated: 0,
	sent: [] as Array<{ op: string; payload: unknown }>
}));

vi.mock('./core/ws.ts', () => ({
	ShardWebSocket: class FakeShardWebSocket {
		constructor(_options: unknown) {}

		connect(): Promise<void> {
			wsState.connectCalls += 1;
			if (wsState.connectFailures > 0) {
				wsState.connectFailures -= 1;
				return Promise.reject(new Error('connect boom'));
			}
			return Promise.resolve();
		}

		on(op: string, handler: Handler): void {
			const list = wsState.handlers.get(op) ?? [];
			list.push(handler);
			wsState.handlers.set(op, list);
		}

		send(message: { op: string; payload: unknown }): void {
			wsState.sent.push(message);
		}

		removeAllListeners(): void {
			wsState.handlers.clear();
		}

		onClose(callback: (code: number, reason: string) => void): void {
			wsState.closeCallback = callback;
		}

		terminate(): void {
			wsState.terminated += 1;
			wsState.closeCallback?.(1006, 'terminated');
		}

		destroy(): void {
			wsState.handlers.clear();
			wsState.closeCallback = null;
		}
	}
}));

const HELLO = { shardCount: 4, shardsPerProcess: 2, heartbeatInterval: 30_000 };

function emit(op: WsOp, payload: unknown): void {
	for (const handler of wsState.handlers.get(op) ?? []) handler({ op, payload });
}

/** 등록·해결까지 필요한 마이크로태스크 흐름을 끝까지 돌려요 (타이머는 테스트가 직접 제어) */
async function flush(): Promise<void> {
	for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

let logCalls: Array<{ level: LogLevel; args: readonly unknown[] }>;
let logger: ILogger;
let client: ShardClient | undefined;

function hasLog(level: LogLevel, needle: string): boolean {
	return logCalls.some((call) => call.level === level && String(call.args[0]).includes(needle));
}

function makeClient(): ShardClient {
	client = new ShardClient({ logger, serverURL: 'ws://localhost:3001' });
	return client;
}

beforeEach(() => {
	wsState.handlers.clear();
	wsState.closeCallback = null;
	wsState.connectCalls = 0;
	wsState.connectFailures = 0;
	wsState.terminated = 0;
	wsState.sent.length = 0;
	logCalls = [];
	logger = {
		info: (...args) => logCalls.push({ level: 'info', args }),
		warn: (...args) => logCalls.push({ level: 'warn', args }),
		error: (...args) => logCalls.push({ level: 'error', args })
	};
	client = undefined;
});

afterEach(() => {
	client?.destroy();
	client = undefined;
	vi.useRealTimers();
});

describe('ShardClient.identify', () => {
	it('HELLO → IDENTIFY → IDENTIFY_ACK 핸드셰이크를 마치면 할당 샤드로 identity를 돌려줘요', async () => {
		const instance = makeClient();
		const promise = instance.identify();
		await flush();

		emit(WsOp.HELLO, HELLO);
		expect(wsState.sent.some((message) => message.op === WsOp.IDENTIFY)).toBe(true);

		emit(WsOp.IDENTIFY_ACK, { shardIds: [0, 1], shardCount: 4 });
		await expect(promise).resolves.toEqual({ shardIds: [0, 1], shardCount: 4 });
		expect(instance.getIdentity()).toEqual({ shardIds: [0, 1], shardCount: 4 });
	});

	it('할당 샤드가 비면 NoShardsAvailableError로 재시도 없이 끝나요', async () => {
		vi.useFakeTimers();
		const instance = makeClient();
		const promise = instance.identify();
		await flush();

		emit(WsOp.HELLO, HELLO);
		emit(WsOp.IDENTIFY_ACK, { shardIds: [], shardCount: 0 });
		await expect(promise).rejects.toBeInstanceOf(NoShardsAvailableError);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(wsState.connectCalls).toBe(1);
		expect(logCalls.filter((call) => call.level === 'error')).toHaveLength(0);
	});

	it('연결 실패는 5초 백오프 한 번 뒤 재시도해요', async () => {
		vi.useFakeTimers();
		wsState.connectFailures = 1;
		const instance = makeClient();
		const promise = instance.identify();

		await vi.advanceTimersByTimeAsync(5_000);
		await flush();
		expect(wsState.connectCalls).toBe(2);
		expect(hasLog('error', 'Retrying in 5s')).toBe(true);

		emit(WsOp.HELLO, HELLO);
		emit(WsOp.IDENTIFY_ACK, { shardIds: [3], shardCount: 4 });
		await expect(promise).resolves.toEqual({ shardIds: [3], shardCount: 4 });
	});

	it('ws close 콜백은 지수 백오프 재연결과 재식별로 이어져요', async () => {
		vi.useFakeTimers();
		const instance = makeClient();
		const promise = instance.identify();
		await flush();
		emit(WsOp.HELLO, HELLO);
		emit(WsOp.IDENTIFY_ACK, { shardIds: [0], shardCount: 4 });
		await promise;
		expect(wsState.connectCalls).toBe(1);

		wsState.closeCallback?.(1006, 'gone');
		await vi.advanceTimersByTimeAsync(1_000);
		await flush();
		expect(wsState.connectCalls).toBe(2);

		emit(WsOp.HELLO, HELLO);
		emit(WsOp.IDENTIFY_ACK, { shardIds: [0], shardCount: 4 });
		await flush();
		expect(hasLog('info', 'Successfully re-identified with shard manager')).toBe(true);
	});
});

describe('ShardClient 하트비트 ACK 감시', () => {
	async function identified(): Promise<ShardClient> {
		const instance = makeClient();
		const promise = instance.identify();
		await flush();
		emit(WsOp.HELLO, HELLO);
		emit(WsOp.IDENTIFY_ACK, { shardIds: [0], shardCount: 4 });
		await promise;
		return instance;
	}

	it('ACK가 오면 연결을 유지해요', async () => {
		vi.useFakeTimers();
		await identified();

		for (let i = 0; i < 3; i += 1) {
			await vi.advanceTimersByTimeAsync(30_000);
			emit(WsOp.HEARTBEAT_ACK, { timestamp: 1 });
		}
		expect(wsState.terminated).toBe(0);
		expect(wsState.sent.filter((message) => message.op === WsOp.HEARTBEAT)).toHaveLength(3);
	});

	it('ACK가 한 주기 동안 없으면 소켓을 끊고 재연결해요', async () => {
		vi.useFakeTimers();
		await identified();

		await vi.advanceTimersByTimeAsync(30_000); // HEARTBEAT 전송, ACK 없음
		expect(wsState.terminated).toBe(0);
		await vi.advanceTimersByTimeAsync(30_000); // 다음 틱: 미수신 감지
		expect(wsState.terminated).toBe(1);
		expect(hasLog('warn', 'HEARTBEAT_ACK not received')).toBe(true);

		await vi.advanceTimersByTimeAsync(1_000); // close 콜백이 시작한 재연결
		await flush();
		expect(wsState.connectCalls).toBe(2);
	});
});

describe('ShardClient.destroy', () => {
	it('destroy 후에는 identify 재시도 루프가 끝나요', async () => {
		vi.useFakeTimers();
		wsState.connectFailures = 100;
		const instance = makeClient();
		const promise = instance.identify();
		const assertion = expect(promise).rejects.toThrow('destroyed');

		await vi.advanceTimersByTimeAsync(5_000);
		instance.destroy();
		await vi.advanceTimersByTimeAsync(5_000);
		await assertion;

		const calls = wsState.connectCalls;
		await vi.advanceTimersByTimeAsync(30_000);
		expect(wsState.connectCalls).toBe(calls);
	});
});
