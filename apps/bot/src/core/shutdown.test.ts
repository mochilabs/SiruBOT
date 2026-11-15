import { describe, expect, it, vi } from 'vitest';
import { STOPPABLES_TIMEOUT_MS } from '../lib/lifecycle.ts';
import { createShutdownHandler, runShutdown, type ShutdownDeps } from './shutdown.ts';

const makeDeps = (calls: string[]) => {
	const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
	const deps = {
		logger,
		container: {
			audio: {
				nodeManager: { nodes: new Map([['n1', { id: 'n1', sessionId: 'sess1' }]]) },
				removeAllListeners: () => void calls.push('audio.removeAllListeners')
			},
			redisStore: {
				getNodeSessionStore: () => ({
					save: async (id: string) => {
						calls.push(`session.save:${id}`);
						return true;
					}
				}),
				flushPendingWrites: async () => void calls.push('redis.flushPendingWrites'),
				disconnect: async () => void calls.push('redis.disconnect')
			},
			lavalinkHandler: { cleanup: () => void calls.push('lavalinkHandler.cleanup') },
			redisSubscribers: ['s1', 's2'].map((name) => ({
				name,
				start: async () => {},
				stop: async () => void calls.push(`subscriber.stop:${name}`)
			})),
			stoppables: ['o1', 'o2'].map((name) => ({
				name,
				stop: async () => void calls.push(`stoppable.stop:${name}`)
			})),
			db: { $disconnect: async () => void calls.push('db.$disconnect') },
			shardClient: { destroy: () => void calls.push('shardClient.destroy') }
		},
		client: { destroy: async () => void calls.push('client.destroy') },
		getHealthServer: () => ({ close: () => void calls.push('health.close') }),
		shardIds: [0],
		closeSentry: async () => void calls.push('sentry.close'),
		exit: (code: number) => void calls.push(`exit:${code}`)
	};
	return { deps: deps as unknown as ShutdownDeps, logger };
};

const EXPECTED_ORDER = [
	'health.close',
	'session.save:n1',
	'lavalinkHandler.cleanup',
	'audio.removeAllListeners',
	'subscriber.stop:s1',
	'subscriber.stop:s2',
	'stoppable.stop:o1',
	'stoppable.stop:o2',
	'redis.flushPendingWrites',
	'redis.disconnect',
	'db.$disconnect',
	'client.destroy',
	'shardClient.destroy',
	'sentry.close',
	'exit:0'
];

describe('shutdown 시퀀스', () => {
	it('종료 순서가 세션 저장 → 정리 → 구독 stop → 소유자 stop → Redis → DB → 게이트웨이 → 샤드 → Sentry → exit 예요', async () => {
		const calls: string[] = [];
		const { deps } = makeDeps(calls);
		await runShutdown(deps, 'SIGTERM');
		expect(calls).toEqual(EXPECTED_ORDER);
	});

	it('중간 단계가 실패해도 이후 단계를 계속 진행해요', async () => {
		const calls: string[] = [];
		const { deps, logger } = makeDeps(calls);
		deps.container.redisStore!.getNodeSessionStore = () => {
			throw new Error('redis down');
		};
		deps.container.redisSubscribers![0].stop = async () => {
			throw new Error('stop failed');
		};
		deps.container.redisStore!.flushPendingWrites = async () => {
			throw new Error('flush failed');
		};
		await runShutdown(deps, 'SIGINT');
		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to save node sessions during shutdown'));
		expect(calls).toEqual(
			EXPECTED_ORDER.filter((c) => c !== 'session.save:n1' && c !== 'subscriber.stop:s1' && c !== 'redis.flushPendingWrites')
		);
	});

	it('소유자 stop이 던져도 나머지 stop과 이후 단계를 계속 진행해요', async () => {
		const calls: string[] = [];
		const { deps, logger } = makeDeps(calls);
		deps.container.stoppables![0].stop = async () => {
			throw new Error('flush failed');
		};
		await runShutdown(deps, 'SIGTERM');
		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to stop o1 during shutdown'));
		expect(calls).toEqual(EXPECTED_ORDER.filter((c) => c !== 'stoppable.stop:o1'));
	});

	it('소유자 stop이 멈춰도 상한 시간 뒤에 다음 단계로 넘어가요', async () => {
		vi.useFakeTimers();
		try {
			const calls: string[] = [];
			const { deps, logger } = makeDeps(calls);
			deps.container.stoppables![0].stop = () => new Promise<void>(() => {});
			const done = runShutdown(deps, 'SIGTERM');
			await vi.advanceTimersByTimeAsync(STOPPABLES_TIMEOUT_MS);
			await done;
			expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`${STOPPABLES_TIMEOUT_MS}ms`));
			expect(calls).toEqual(EXPECTED_ORDER.filter((c) => c !== 'stoppable.stop:o1'));
		} finally {
			vi.useRealTimers();
		}
	});

	it('재진입 가드: 시그널이 중복 도착해도 한 번만 실행해요', async () => {
		const calls: string[] = [];
		const { deps } = makeDeps(calls);
		const handler = createShutdownHandler(deps);
		await Promise.all([handler('SIGINT'), handler('SIGTERM')]);
		await handler('SIGTERM');
		expect(calls).toEqual(EXPECTED_ORDER);
	});
});
