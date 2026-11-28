import type { Server } from 'node:http';
import type { Container } from '@sapphire/pieces';
import { NodeSessionStore } from '../features/music/index.ts';
import { stopAll } from '../lib/lifecycle.ts';
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

// 종료 순서가 Lavalink 세션 보존 계약이에요 (세션 저장 → 타이머/구독 정리 → stoppables → 저널 flush → Redis/DB/클라이언트 종료).
export const runShutdown = async (deps: ShutdownDeps, signal: string): Promise<void> => {
	const { logger, container, client } = deps;
	logger.info(`${signal} received. Shutting down gracefully...`);
	const healthServer = deps.getHealthServer();
	if (healthServer) {
		healthServer.close();
	}

	if (container.audio && container.redisStore) {
		try {
			const sessionStore = container.redisStore.getNodeSessionStore();
			const shardKey = NodeSessionStore.makeShardKey(Array.isArray(deps.shardIds) ? deps.shardIds : [0]);
			for (const node of container.audio.nodeManager.nodes.values()) {
				if (node.sessionId) {
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

	// 타이머가 종료 중 mixer REST/play를 발화하지 않도록 먼저 해제해요.
	container.lavalinkHandler?.cleanup();
	if (container.audio) {
		container.audio.removeAllListeners();
	}
	await stopRedisSubscribers(container.redisSubscribers);
	await stopAll(container.stoppables, logger);
	if (container.redisStore) {
		await container.redisStore.flushPendingWrites().catch(() => null);
		await container.redisStore.disconnect().catch(() => null);
	}

	if (container.db) {
		await container.db.$disconnect().catch(() => null);
	}

	await client.destroy().catch(() => null);

	if (container.shardClient) {
		container.shardClient.destroy();
	}
	await deps.closeSentry(2000);
	deps.exit(0);
};

export const createShutdownHandler = (deps: ShutdownDeps) => {
	let shutdownStarted = false;
	return async (signal: string): Promise<void> => {
		if (shutdownStarted) return;
		shutdownStarted = true;
		await runShutdown(deps, signal);
	};
};
