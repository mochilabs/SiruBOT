import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import fastifyWebsocket from '@fastify/websocket';
import { WsOp, type WsMessage } from '@sirubot/shardclient/ws-types';
import wsRoutes from './index.ts';
import { ShardRegistry } from '../../core/shardRegistry.ts';
import type { DiscordNotifier } from '../../utils/discordNotifier.ts';

const AUTH_KEY = 'ws-test-key';

function notifierStub() {
	return {
		shardConnected: async () => {},
		shardDisconnected: async () => {},
		shardReady: async () => {},
		shardHeartbeatTimeout: async () => {},
		allShardsReady: async () => {}
	} as unknown as DiscordNotifier;
}

describe('ws IDENTIFY route', () => {
	const apps: FastifyInstance[] = [];
	const registries: ShardRegistry[] = [];
	const sockets: WebSocket[] = [];

	afterEach(async () => {
		for (const socket of sockets.splice(0)) socket.terminate();
		for (const registry of registries.splice(0)) registry.destroy();
		await Promise.all(apps.splice(0).map((app) => app.close()));
	});

	async function startServer(shardCount = 4, shardsPerProcess = 2) {
		const notifier = notifierStub();
		const registry = new ShardRegistry(shardCount, shardsPerProcess, notifier);
		registries.push(registry);
		const app = Fastify();
		// ws 라우트는 fastify.manager 로케이터로 registry/notifier/authKey를 끌어와요.
		app.decorate('manager', { getRegistry: () => registry, getNotifier: () => notifier, getAuthKey: () => AUTH_KEY } as never);
		await app.register(fastifyWebsocket, { options: { maxPayload: 64 * 1024 } });
		await app.register(wsRoutes);
		await app.listen({ port: 0, host: '127.0.0.1' });
		apps.push(app);
		const address = app.server.address();
		const port = typeof address === 'object' && address !== null ? address.port : 0;
		return { registry, port };
	}

	class TestClient {
		public readonly messages: WsMessage<unknown>[] = [];
		public closeInfo: Promise<{ code: number; reason: string }> | null = null;

		private constructor(private readonly socket: WebSocket) {
			// terminate/서버 종료로 오는 후행 에러 이벤트는 조용히 흡수해요 (unhandled 'error' 방지).
			socket.on('error', () => {});
			socket.on('message', (raw) => {
				this.messages.push(JSON.parse(raw.toString()) as WsMessage<unknown>);
			});
		}

		public static async connect(port: number): Promise<TestClient> {
			const socket = new WebSocket(`ws://127.0.0.1:${port}/`);
			sockets.push(socket);
			// 메시지 리스너는 open 대기 전에 붙여요 — HELLO는 101 업그레이드 응답과 같은 첫 데이터 뭉치로 올 수 있어요.
			const client = new TestClient(socket);
			client.closeInfo = new Promise((resolve) => socket.once('close', (code, reason) => resolve({ code, reason: reason.toString() })));
			await new Promise<void>((resolve, reject) => {
				socket.once('open', () => resolve());
				socket.once('error', reject);
			});
			return client;
		}

		public send(op: WsOp, payload: unknown): void {
			this.socket.send(JSON.stringify({ op, payload }));
		}

		/** 특정 조건의 메시지를 기다려요 — 서버는 클라이언트 메시지를 마주쳐야 응답하므로 polling이 자연스러워요. */
		public async waitFor(predicate: (message: WsMessage<unknown>) => boolean, timeoutMs = 2_000): Promise<WsMessage<unknown>> {
			const deadline = Date.now() + timeoutMs;
			while (Date.now() < deadline) {
				const found = this.messages.find(predicate);
				if (found) return found;
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			throw new Error(`timed out waiting for ws message — got ${JSON.stringify(this.messages)}`);
		}

		public async waitForClose(timeoutMs = 2_000): Promise<{ code: number; reason: string }> {
			if (!this.closeInfo) throw new Error('closeInfo missing');
			return Promise.race([
				this.closeInfo,
				new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('timed out waiting for ws close')), timeoutMs))
			]);
		}

		/** 조건 없이 잠깐 기다려요 — "오면 안 되는" 메시지 부재 검증용. */
		public async waitQuietly(ms: number): Promise<void> {
			await new Promise((resolve) => setTimeout(resolve, ms));
		}
	}

	it('greets with HELLO carrying shard topology', async () => {
		const { port } = await startServer(6, 3);
		const client = await TestClient.connect(port);
		const hello = await client.waitFor((message) => message.op === WsOp.HELLO);
		expect(hello.payload).toMatchObject({ shardCount: 6, shardsPerProcess: 3, heartbeatInterval: 30_000 });
	});

	it('rejects IDENTIFY with a bad token and closes the socket (이중 토큰 검증)', async () => {
		const { port } = await startServer();
		const client = await TestClient.connect(port);
		client.send(WsOp.IDENTIFY, { token: 'wrong-token', hostname: 'host-a' });
		const ack = await client.waitFor((message) => message.op === WsOp.IDENTIFY_ACK);
		expect(ack.payload).toMatchObject({ shardIds: [], shardCount: 0 });
		expect((await client.waitForClose()).code).toBe(4008);
	});

	it('allocates shards on IDENTIFY and refuses re-identification on the same socket (SEC-003)', async () => {
		const { port } = await startServer();
		const client = await TestClient.connect(port);
		client.send(WsOp.IDENTIFY, { token: AUTH_KEY, hostname: 'host-a' });
		const ack = await client.waitFor((message) => message.op === WsOp.IDENTIFY_ACK);
		expect(ack.payload).toMatchObject({ shardIds: [0, 1], shardCount: 4 });

		client.send(WsOp.IDENTIFY, { token: AUTH_KEY, hostname: 'host-a' });
		await client.waitQuietly(200);
		expect(client.messages.filter((message) => message.op === WsOp.IDENTIFY_ACK)).toHaveLength(1);
	});

	it('refuses re-identification that would claim shards held by a live process', async () => {
		const { port } = await startServer();
		const first = await TestClient.connect(port);
		first.send(WsOp.IDENTIFY, { token: AUTH_KEY, hostname: 'host-a' });
		await first.waitFor((message) => message.op === WsOp.IDENTIFY_ACK);

		const second = await TestClient.connect(port);
		second.send(WsOp.IDENTIFY, { token: AUTH_KEY, hostname: 'host-b', shardIds: [0] });
		const ack = await second.waitFor((message) => message.op === WsOp.IDENTIFY_ACK);
		expect(ack.payload).toMatchObject({ shardIds: [], shardCount: 0 });
		expect((await second.waitForClose()).code).toBe(4002);
	});

	it('accepts re-identification claiming free shards', async () => {
		const { port } = await startServer();
		const client = await TestClient.connect(port);
		client.send(WsOp.IDENTIFY, { token: AUTH_KEY, hostname: 'host-b', shardIds: [2, 3] });
		const ack = await client.waitFor((message) => message.op === WsOp.IDENTIFY_ACK);
		expect(ack.payload).toMatchObject({ shardIds: [2, 3], shardCount: 4 });
	});

	it('ignores non-IDENTIFY ops before identification without closing the socket', async () => {
		const { port } = await startServer();
		const client = await TestClient.connect(port);
		client.send(WsOp.HEARTBEAT, { timestamp: Date.now() });
		await client.waitQuietly(200);
		expect(client.messages.filter((message) => message.op === WsOp.HEARTBEAT_ACK)).toHaveLength(0);

		client.send(WsOp.IDENTIFY, { token: AUTH_KEY, hostname: 'host-a' });
		const ack = await client.waitFor((message) => message.op === WsOp.IDENTIFY_ACK);
		expect(ack.payload).toMatchObject({ shardIds: [0, 1] });
	});
});
