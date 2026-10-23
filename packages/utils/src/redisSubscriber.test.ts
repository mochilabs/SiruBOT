import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagedRedisSubscriber, type RedisSubscriberLogger } from './redisSubscriber.ts';

// stop()과 connect 완료의 레이스, subscribe 실패 시 새 클라이언트 누수를 고정하는 회귀 테스트예요.

interface MockClient {
	on: ReturnType<typeof vi.fn>;
	connect: ReturnType<typeof vi.fn>;
	subscribe: ReturnType<typeof vi.fn>;
	unsubscribe: ReturnType<typeof vi.fn>;
	quit: ReturnType<typeof vi.fn>;
	destroy: ReturnType<typeof vi.fn>;
	isOpen: boolean;
}

const harness = vi.hoisted(() => ({
	clients: [] as MockClient[],
	createClient: (): MockClient => {
		throw new Error('harness.createClient를 먼저 설정하세요');
	}
}));

vi.mock('@redis/client', () => ({
	createClient: () => harness.createClient()
}));

function makeClient(): MockClient {
	const client: MockClient = {
		on: vi.fn(),
		connect: vi.fn().mockResolvedValue(undefined),
		subscribe: vi.fn().mockResolvedValue(undefined),
		unsubscribe: vi.fn().mockResolvedValue(undefined),
		quit: vi.fn().mockResolvedValue(undefined),
		destroy: vi.fn(),
		isOpen: true
	};
	harness.clients.push(client);
	return client;
}

function silentLogger(): RedisSubscriberLogger {
	return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('ManagedRedisSubscriber', () => {
	beforeEach(() => {
		harness.clients.length = 0;
		harness.createClient = () => makeClient();
	});

	it('정상 시작 후 stop()이 구독 해제와 연결 종료를 해요', async () => {
		const logger = silentLogger();
		const subscriber = new ManagedRedisSubscriber({
			name: '테스트',
			url: 'redis://localhost',
			logger,
			bindings: [{ channel: 'ch1', onMessage: vi.fn() }]
		});
		await subscriber.start();
		expect(subscriber.isSubscribed).toBe(true);

		await subscriber.stop();
		const client = harness.clients[0]!;
		expect(client.unsubscribe).toHaveBeenCalledWith('ch1');
		expect(client.quit).toHaveBeenCalled();
		expect(subscriber.isSubscribed).toBe(false);
	});

	it('stop()이 connect 완료 전에 불리면 완성된 구독 연결을 즉시 닫아요 — 잔류 소켓 없음', async () => {
		let resolveConnect: () => void = () => undefined;
		const client = makeClient();
		client.connect.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveConnect = resolve;
				})
		);
		harness.createClient = () => client;
		const subscriber = new ManagedRedisSubscriber({
			name: '테스트',
			url: 'redis://localhost',
			logger: silentLogger(),
			bindings: [{ channel: 'ch1', onMessage: vi.fn() }],
			reconnectDelayMs: 60_000
		});

		const starting = subscriber.start();
		await flush();
		await subscriber.stop();

		// subscribe까지 끝난 뒤에도 this.subscriber에 올리지 않고 즉시 quit해요
		resolveConnect();
		await starting;
		expect(client.subscribe).toHaveBeenCalled();
		expect(client.quit).toHaveBeenCalled();
		expect(subscriber.isSubscribed).toBe(false);
	});

	it('connect 성공 후 subscribe 실패 시 새 클라이언트를 destroy해요 — 소켓 누수 없음', async () => {
		vi.useFakeTimers();
		try {
			const client = makeClient();
			client.subscribe.mockRejectedValue(new Error('subscribe 실패'));
			harness.createClient = () => client;
			const logger = silentLogger();
			const subscriber = new ManagedRedisSubscriber({
				name: '테스트',
				url: 'redis://localhost',
				logger,
				bindings: [{ channel: 'ch1', onMessage: vi.fn() }],
				reconnectDelayMs: 60_000
			});

			await subscriber.start();
			expect(client.destroy).toHaveBeenCalled();
			expect(subscriber.isSubscribed).toBe(false);
			expect(logger.warn).toHaveBeenCalled();
			// 재연결 예약은 됐지만 재시도 전까지 연결은 없어요
			expect(subscriber.isSubscribed).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it('connect 자체가 실패해도 throw하지 않고 재연결을 예약해요', async () => {
		vi.useFakeTimers();
		try {
			const client = makeClient();
			client.connect.mockRejectedValue(new Error('연결 거부'));
			harness.createClient = () => client;
			const subscriber = new ManagedRedisSubscriber({
				name: '테스트',
				url: 'redis://localhost',
				logger: silentLogger(),
				bindings: [{ channel: 'ch1', onMessage: vi.fn() }],
				reconnectDelayMs: 60_000
			});

			await expect(subscriber.start()).resolves.toBeUndefined();
			expect(subscriber.isSubscribed).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});
});
