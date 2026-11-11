import type { Server } from 'node:http';
import type { Container } from '@sapphire/pieces';
import { NodeSessionStore } from '../modules/audio/lavalink/redisStore.ts';
import { stopAll } from './lifecycle.ts';
import { stopRedisSubscribers } from './redisSubscribers.ts';

type ShutdownLogger = { info: (msg: string) => unknown; warn: (msg: string) => unknown; error: (msg: string) => unknown };

export interface ShutdownDeps {
	logger: ShutdownLogger;
	container: Partial<Pick<Container, 'audio' | 'redisStore' | 'lavalinkHandler' | 'redisSubscribers' | 'stoppables' | 'db' | 'shardClient'>>;
	client: { destroy: () => Promise<void> };
	getHealthServer: () => Pick<Server, 'close'> | null;
	shardIds: number[] | 'auto';
	closeSentry: (timeoutMs: number) => Promise<unknown>;
	exit: (code: number) => unknown;
}

/**
 * 종료 시퀀스 (순서가 곧 Lavalink 세션 보존 계약이에요 — bot-ops 스킬 참고).
 * 헬스 서버 → 노드 세션 Redis 저장 → Lavalink 핸들러/리스너 정리 → Redis 구독 서비스 stop
 * → 소유자 stop(대기 중인 저장 flush·타이머 해제) → 저널 flush → Redis disconnect → DB disconnect → client.destroy → shardClient.destroy → Sentry flush → exit.
 * 단계마다 실패 처리 방식이 달라서(로그/무시/전파) Lifecycle 대신 명시적인 순서로 둬요.
 */
export const runShutdown = async (deps: ShutdownDeps, signal: string): Promise<void> => {
	const { logger, container, client } = deps;
	logger.info(`${signal} received. Shutting down gracefully...`);
	const healthServer = deps.getHealthServer();
	if (healthServer) {
		healthServer.close();
	}

	// 종료 순서: 세션 저장 → 리스너 정리 → Redis → DB → 샤드 클라이언트 (세션 저장은 Redis 끊기 전에)
	if (container.audio && container.redisStore) {
		try {
			const sessionStore = container.redisStore.getNodeSessionStore();
			const shardKey = NodeSessionStore.makeShardKey(Array.isArray(deps.shardIds) ? deps.shardIds : [0]);
			for (const node of container.audio.nodeManager.nodes.values()) {
				if (node.sessionId) {
					// save는 Redis가 끊겨 있으면 실제로 기록하지 않는다 — 거짓 성공 로그를 내지 않는다.
					const saved = await sessionStore.save(node.id, node.sessionId, shardKey);
					if (saved) {
						logger.info(`Saved session for node ${node.id}: ${node.sessionId}`);
					} else {
						logger.warn(`Session save skipped/failed for node ${node.id} (redis unavailable)`);
					}
				}
			}
		} catch (error) {
			logger.error(`Failed to save node sessions during shutdown: ${error}`);
		}
	}

	// Audio listeners 정리 (+ 설정 무효화 구독 해제)
	// lavalink 핸들러의 watchdog/reconcile/복구 타이머를 먼저 해제한다 — 남은 타이머가
	// 종료 절차 중에 발화해 mixer REST/play를 시도하는 것을 막는다.
	container.lavalinkHandler?.cleanup();
	if (container.audio) {
		container.audio.removeAllListeners();
	}
	await stopRedisSubscribers(container.redisSubscribers);
	// 새 일이 더 들어오지 않는 시점에 상태 소유자를 stop한다 — 대기 중인 저장을 지금 쓰고 타이머를 해제한다.
	// 쓰기 대상(Redis/DB)을 닫기 전이어야 하므로 아래 flush/disconnect보다 앞이다. 전체 단계는 STOPPABLES_TIMEOUT_MS로 묶인다.
	await stopAll(container.stoppables, logger);
	// 종료 전에 저널을 비운다 — Redis를 끊은 뒤엔 pending 큐/플레이어 변경이 소실된다.
	// 세션 저장(위)은 Redis 연결이 필요한 첫 단계고, 여기서 남은 저널을 마저 민 뒤 끊는다.
	if (container.redisStore) {
		await container.redisStore.flushPendingWrites().catch(() => null);
		await container.redisStore.disconnect().catch(() => null);
	}

	if (container.db) {
		await container.db.$disconnect().catch(() => null);
	}

	// 게이트웨이 정리 — 이 시점부터 새 이벤트가 유출되지 않는다.
	await client.destroy().catch(() => null);

	if (container.shardClient) {
		container.shardClient.destroy();
	}
	// Flush unsent Sentry events
	await deps.closeSentry(2000);
	deps.exit(0);
};

/** 재진입 가드가 붙은 시그널 핸들러를 만들어요. SIGINT/SIGTERM 중복 도착이나 핸들러 이중 실행을 막아요. */
export const createShutdownHandler = (deps: ShutdownDeps) => {
	let shutdownStarted = false;
	return async (signal: string): Promise<void> => {
		if (shutdownStarted) return;
		shutdownStarted = true;
		await runShutdown(deps, signal);
	};
};
