/**
 * 봇 관리자(운영자) 제어 응답자 — 대시보드 관리자 패널(/admin) 요청 → data-api Redis → 봇 수행.
 *
 * Lavalink 노드 상태 조회·재연결·연결 해제, 앱 이모지 조회·동기화, Sapphire 스토어 리로드처럼
 * 봇 런타임 내부 상태를 조회하거나 제어하는 작업을 수행한다.
 * - 노드 재연결·연결 해제·스토어 리로드는 구독한 모든 봇 프로세스가 수행하고,
 *   응답 퍼블리시는 대표 프로세스(shard 0 보유, 또는 단독 모드)만 내려 중복 응답을 방지한다.
 * - 앱 이모지 동기화는 Discord Application API를 건드리므로 대표 프로세스만 수행한다.
 * - 어떤 경우에도 절대 throw하지 않는다.
 */
import { container } from '@sapphire/framework';
import {
	BOT_ADMIN_REQUEST_CHANNEL,
	botAdminRequestSchema,
	ManagedRedisSubscriber,
	type BotAdminNodeItem,
	type BotAdminReloadStore,
	type BotAdminRequest,
	type BotAdminResponse
} from '@sirubot/utils';
import { unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { NodeSessionStore } from '../modules/audio/lavalink/redisStore.ts';
import type { ServiceLogger } from './types.ts';

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

export class BotAdminResponder {
	private subscriber: ManagedRedisSubscriber | null = null;

	public constructor(
		private readonly logger: ServiceLogger,
		private readonly signingKey: string = ''
	) {}

	public async start(redisUrl: string | undefined): Promise<void> {
		const url = redisUrl?.trim() || null;
		if (!url) {
			this.logger.warn('REDIS_URL 미설정: 봇 관리자 제어 응답 없이 동작해요');
			return;
		}
		this.subscriber = new ManagedRedisSubscriber({
			name: '봇 관리자 제어',
			url,
			logger: this.logger,
			bindings: [
				{
					channel: BOT_ADMIN_REQUEST_CHANNEL,
					onMessage: (raw) => {
						const body = unwrapRedisMessage(this.signingKey, raw);
						if (body === null) {
							this.logger.warn('봇 관리자 제어 요청 거부: 서명 검증 실패');
							return;
						}
						void this.handleRequest(body);
					}
				}
			]
		});
		await this.subscriber.start();
	}

	public async stop(): Promise<void> {
		const subscriber = this.subscriber;
		this.subscriber = null;
		await subscriber?.stop();
	}

	public async handleRequest(raw: string): Promise<void> {
		let payload: unknown;
		try {
			payload = JSON.parse(raw);
		} catch {
			return;
		}
		const parsed = botAdminRequestSchema.safeParse(payload);
		if (!parsed.success) {
			this.logger.debug(`봇 관리자 제어 페이로드 형식 불일치: ${raw.slice(0, 100)}`);
			return;
		}
		const req = parsed.data;
		try {
			await this.executeRequest(req);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			this.logger.error(`봇 관리자 제어 실패 (${req.kind}): ${msg}`);
			if (isPrimaryProcess()) {
				this.respond({
					requestId: req.requestId,
					kind: req.kind,
					error: `봇 제어 중 오류가 발생했어요: ${msg}`
				});
			}
		}
	}

	private async executeRequest(req: BotAdminRequest): Promise<void> {
		const primary = isPrimaryProcess();

		switch (req.kind) {
			case 'nodes-status': {
				if (!primary) return;
				this.respond({
					requestId: req.requestId,
					kind: req.kind,
					nodes: collectNodeItems()
				});
				return;
			}
			case 'node-reconnect': {
				const audio = container.audio;
				if (!audio) {
					if (primary) {
						this.respond({ requestId: req.requestId, kind: req.kind, error: '오디오 시스템이 아직 초기화되지 않았어요.' });
					}
					return;
				}
				const node = req.nodeId ? audio.nodeManager.nodes.get(req.nodeId) : undefined;
				if (!node) {
					if (primary) {
						this.respond({ requestId: req.requestId, kind: req.kind, error: `노드 '${req.nodeId ?? ''}'을(를) 찾을 수 없어요.` });
					}
					return;
				}

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

				if (primary) {
					this.respond({
						requestId: req.requestId,
						kind: req.kind,
						nodes: collectNodeItems(),
						message: `노드 '${node.id}' 재연결을 요청했어요.`
					});
				}
				return;
			}
			case 'node-disconnect': {
				const audio = container.audio;
				if (!audio) {
					if (primary) {
						this.respond({ requestId: req.requestId, kind: req.kind, error: '오디오 시스템이 아직 초기화되지 않았어요.' });
					}
					return;
				}
				const node = req.nodeId ? audio.nodeManager.nodes.get(req.nodeId) : undefined;
				if (!node) {
					if (primary) {
						this.respond({ requestId: req.requestId, kind: req.kind, error: `노드 '${req.nodeId ?? ''}'을(를) 찾을 수 없어요.` });
					}
					return;
				}
				node.disconnect('Admin panel manual disconnect');
				if (primary) {
					this.respond({
						requestId: req.requestId,
						kind: req.kind,
						nodes: collectNodeItems(),
						message: `노드 '${node.id}' 연결을 해제했어요.`
					});
				}
				return;
			}
			case 'emojis-list': {
				if (!primary) return;
				const manager = container.appEmojiManager;
				if (!manager) {
					this.respond({ requestId: req.requestId, kind: req.kind, error: '앱 이모지 매니저가 초기화되지 않았어요.' });
					return;
				}
				const emojis = await manager.list();
				this.respond({
					requestId: req.requestId,
					kind: req.kind,
					emojis
				});
				return;
			}
			case 'emojis-sync': {
				if (!primary) return;
				const manager = container.appEmojiManager;
				if (!manager) {
					this.respond({ requestId: req.requestId, kind: req.kind, error: '앱 이모지 매니저가 초기화되지 않았어요.' });
					return;
				}
				await manager.sync(true);
				const emojis = await manager.list();
				this.respond({
					requestId: req.requestId,
					kind: req.kind,
					emojis,
					message: `앱 이모지 동기화를 완료했어요 (총 ${emojis.length}개).`
				});
				return;
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
							this.logger.error(`피스 리로드 실패 (${store.name}/${piece.location.name}): ${error}`);
							failed++;
						}
					}
					storesResult.push({ storeName: store.name, total, succeeded, failed });
				}
				if (primary) {
					this.respond({
						requestId: req.requestId,
						kind: req.kind,
						stores: storesResult,
						message: '명령어·리스너 스토어 리로드를 완료했어요.'
					});
				}
				return;
			}
		}
	}

	private respond(response: BotAdminResponse): void {
		const store = container.redisStore;
		if (!store) {
			this.logger.warn(`봇 관리자 제어 응답을 위한 redisStore가 없어요 (${response.kind})`);
			return;
		}
		store.publishBotAdminResponse(wrapRedisMessage(this.signingKey, response));
	}
}
