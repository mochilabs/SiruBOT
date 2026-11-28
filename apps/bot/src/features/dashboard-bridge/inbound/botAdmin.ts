import { container } from '@sapphire/framework';
import { botAdminRpc, type BotAdminNodeItem, type BotAdminReloadStore, type BotAdminRequest } from '@sirubot/utils';
import { createGlobalRedisResponder, type RedisBinding, type RedisRpcPayload } from '../../../lib/redisResponder.ts';
import type { RedisLogger } from '../../../lib/redisPublisher.ts';
import { NodeSessionStore } from '../../music/index.ts';

type Payload = RedisRpcPayload<typeof botAdminRpc>;

function isPrimaryProcess(): boolean {
	const shardIds = container.shardInfo?.shardIds;
	if (!shardIds || shardIds.length === 0) return true;
	return shardIds.includes(0);
}

function collectNodeItems(): BotAdminNodeItem[] {
	const audio = container.audio;
	if (!audio) return [];
	const items: BotAdminNodeItem[] = [];
	for (const [id, node] of audio.nodeManager.nodes) {
		const stats = node.stats;
		const ping =
			typeof node.heartBeatPing === 'number' && Number.isFinite(node.heartBeatPing) && node.heartBeatPing >= 0
				? Math.round(node.heartBeatPing)
				: null;
		items.push({
			id,
			host: node.options.host,
			port: node.options.port,
			connected: Boolean(node.connected),
			sessionId: node.sessionId ?? null,
			players: stats?.players ?? 0,
			playingPlayers: stats?.playingPlayers ?? 0,
			uptimeMs: stats?.uptime ?? 0,
			memoryUsedBytes: stats?.memory?.used ?? 0,
			memoryReservableBytes: stats?.memory?.reservable ?? 0,
			cpuLavalinkLoad: stats?.cpu?.lavalinkLoad ?? 0,
			cpuSystemLoad: stats?.cpu?.systemLoad ?? 0,
			pingMs: ping
		});
	}
	return items;
}

async function executeRequest(req: BotAdminRequest, logger: RedisLogger): Promise<Payload | null> {
	const primary = isPrimaryProcess();
	const reply = (payload: Payload): Payload | null => (primary ? payload : null);

	switch (req.kind) {
		case 'nodes-status':
			return reply({ nodes: collectNodeItems() });
		case 'node-reconnect': {
			const audio = container.audio;
			if (!audio) return reply({ error: '오디오 시스템이 아직 초기화되지 않았어요.' });
			const node = req.nodeId ? audio.nodeManager.nodes.get(req.nodeId) : undefined;
			if (!node) return reply({ error: `노드 '${req.nodeId ?? ''}'을(를) 찾을 수 없어요.` });

			let sessionId = node.sessionId ?? undefined;
			if (!sessionId && container.redisStore && container.shardInfo) {
				const shardKey = NodeSessionStore.makeShardKey(container.shardInfo.shardIds);
				const saved = await container.redisStore.getNodeSessionStore().get(node.id, shardKey);
				if (saved) sessionId = saved;
			}

			if (node.connected) {
				node.disconnect('Admin panel manual reconnect');
			}
			node.connect(sessionId);

			return reply({ nodes: collectNodeItems(), message: `노드 '${node.id}' 재연결을 요청했어요.` });
		}
		case 'node-disconnect': {
			const audio = container.audio;
			if (!audio) return reply({ error: '오디오 시스템이 아직 초기화되지 않았어요.' });
			const node = req.nodeId ? audio.nodeManager.nodes.get(req.nodeId) : undefined;
			if (!node) return reply({ error: `노드 '${req.nodeId ?? ''}'을(를) 찾을 수 없어요.` });
			node.disconnect('Admin panel manual disconnect');
			return reply({ nodes: collectNodeItems(), message: `노드 '${node.id}' 연결을 해제했어요.` });
		}
		case 'emojis-list': {
			if (!primary) return null;
			const manager = container.appEmojiManager;
			if (!manager) return { error: '앱 이모지 매니저가 초기화되지 않았어요.' };
			return { emojis: await manager.list() };
		}
		case 'emojis-sync': {
			if (!primary) return null;
			const manager = container.appEmojiManager;
			if (!manager) return { error: '앱 이모지 매니저가 초기화되지 않았어요.' };
			await manager.sync(true);
			const emojis = await manager.list();
			return { emojis, message: `앱 이모지 동기화를 완료했어요 (총 ${emojis.length}개).` };
		}
		case 'reload-stores': {
			const storesResult: BotAdminReloadStore[] = [];
			for (const store of container.stores.values()) {
				let total = 0;
				let succeeded = 0;
				let failed = 0;
				for (const piece of store.values()) {
					if (piece.location.virtual) continue;
					total++;
					try {
						await piece.reload();
						succeeded++;
					} catch (error) {
						logger.error(`피스 리로드 실패 (${store.name}/${piece.location.name}): ${error}`);
						failed++;
					}
				}
				storesResult.push({ storeName: store.name, total, succeeded, failed });
			}
			return reply({ stores: storesResult, message: '명령어·리스너 스토어 리로드를 완료했어요.' });
		}
	}
}

export function createBotAdminResponder(): RedisBinding {
	return createGlobalRedisResponder(botAdminRpc, async ({ request, logger }) => {
		try {
			return await executeRequest(request, logger);
		} catch (error) {
			// 실패 응답도 대표 프로세스만 내려요 — 팩토리의 일반 오류 응답 경로를 쓰면 모든 프로세스가 답해 버려요.
			const msg = error instanceof Error ? error.message : String(error);
			logger.error(`봇 관리자 제어 실패 (${request.kind}): ${msg}`);
			return isPrimaryProcess() ? { error: `봇 제어 중 오류가 발생했어요: ${msg}` } : null;
		}
	});
}
