import type { WebSocket } from '@fastify/websocket';
import { getLogger } from '../utils/logger.ts';
import type { ShardStatus, ShardStatsPayload } from '@sirubot/shardclient/ws-types';
import type { DiscordNotifier } from '../utils/discordNotifier.ts';

const logger = getLogger('shardRegistry');

export const HEARTBEAT_TIMEOUT_MS = 60_000;
const HEARTBEAT_CHECK_INTERVAL_MS = 15_000;

/** ws readyState 값: 2(CLOSING)/3(CLOSED)는 이미 끊긴 소켓이에요 */
const WS_CLOSING = 2;
const WS_CLOSED = 3;

interface ShardProcessInfo {
	shardIds: number[];
	status: ShardStatus;
	hostname?: string;
	guilds: number;
	players: number;
	memoryUsage: number;
	uptime: number;
	lastHeartbeat: number;
	connectedAt: number;
	wsConnection: WebSocket;
}

export class ShardRegistry {
	private processes: Map<string, ShardProcessInfo> = new Map(); // wsId -> info
	private allocatedShards: Set<number> = new Set();
	private shardCount: number;
	private shardsPerProcess: number;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private notifier: DiscordNotifier;
	private previouslyAllReady: boolean = false;

	constructor(shardCount: number, shardsPerProcess: number = 5, notifier: DiscordNotifier) {
		this.shardCount = shardCount;
		this.shardsPerProcess = shardsPerProcess;
		this.notifier = notifier;
		this.startHeartbeatMonitor();
	}

	public allocateShardIds(): number[] | null {
		const available: number[] = [];

		for (let i = 0; i < this.shardCount; i++) {
			if (!this.allocatedShards.has(i)) {
				available.push(i);
				if (available.length >= this.shardsPerProcess) break;
			}
		}

		if (available.length === 0) {
			logger.warn('No available shard IDs to allocate');
			return null;
		}

		for (const id of available) {
			this.allocatedShards.add(id);
		}

		logger.info(`Allocated shard IDs: [${available.join(', ')}]`);
		return available;
	}

	/**
	 * Re-identification용 샤드 ID claim: 요청 전체를 검증하고, 하나라도 잘못되면 null을 돌려줘요.
	 * - 각 ID는 [0, shardCount) 안의 정수여야 하고 중복이면 안 돼요
	 * - 살아있는 다른 프로세스가 점유 중인 ID는 거부해요 (샤드 이중 점유/탈취 방지)
	 * - 점유 주인의 소켓이 이미 끊긴 경우(재연결 레이스)에는 이전 등록에서 떼어와 새 주인에게 넘겨요
	 * 할당 집합(allocatedShards)에만 남은 유실 ID는 재사용해요. 이전 버전의 할당 누수를 스스로 치유해요.
	 */
	public claimShards(wsId: string, requested: number[]): number[] | null {
		const claimed: number[] = [];
		const seen = new Set<number>();

		for (const shardId of requested) {
			if (!Number.isInteger(shardId) || shardId < 0 || shardId >= this.shardCount) return null;
			if (seen.has(shardId)) return null;
			seen.add(shardId);

			const owner = this.findShardOwner(shardId);
			if (owner && owner.wsId !== wsId) {
				const readyState = owner.info.wsConnection.readyState;
				if (readyState !== WS_CLOSING && readyState !== WS_CLOSED) return null;
				// 끊긴 소켓의 잔여 등록: 이후 release가 이 ID를 다시 해제하지 않도록 떼어내요
				owner.info.shardIds = owner.info.shardIds.filter((id) => id !== shardId);
				logger.info(`Shard ${shardId} reclaimed from disconnected process ${owner.wsId}`);
			}
			claimed.push(shardId);
		}

		for (const shardId of claimed) {
			this.allocatedShards.add(shardId);
		}
		logger.info(`Claimed shard IDs for ${wsId}: [${claimed.join(', ')}]`);
		return claimed;
	}

	private findShardOwner(shardId: number): { wsId: string; info: ShardProcessInfo } | null {
		for (const [wsId, info] of this.processes.entries()) {
			if (info.shardIds.includes(shardId)) return { wsId, info };
		}
		return null;
	}

	public register(wsId: string, shardIds: number[], ws: WebSocket, hostname?: string): void {
		this.processes.set(wsId, {
			shardIds,
			status: 'connecting',
			hostname,
			guilds: 0,
			players: 0,
			memoryUsage: 0,
			uptime: 0,
			lastHeartbeat: Date.now(),
			connectedAt: Date.now(),
			wsConnection: ws
		});

		logger.info(`Registered process ${wsId}${hostname ? ` (${hostname})` : ''} with shards [${shardIds.join(', ')}]`);
	}

	public getProcess(wsId: string): ShardProcessInfo | undefined {
		return this.processes.get(wsId);
	}

	public release(wsId: string): number[] | undefined {
		const process = this.processes.get(wsId);
		if (!process) return undefined;

		for (const id of process.shardIds) {
			this.allocatedShards.delete(id);
		}

		const released = process.shardIds;
		this.processes.delete(wsId);

		logger.info(`Released process ${wsId}, freed shards [${released.join(', ')}]`);
		this.checkAllShardsReady();
		return released;
	}

	public heartbeat(wsId: string): void {
		const process = this.processes.get(wsId);
		if (process) {
			process.lastHeartbeat = Date.now();
		}
	}

	public updateStatus(wsId: string, status: ShardStatus): void {
		const process = this.processes.get(wsId);
		if (process) {
			process.status = status;
			logger.info(`Process ${wsId} status: ${status}`);
			this.checkAllShardsReady();
		}
	}

	private checkAllShardsReady(): void {
		let readyShards = 0;
		for (const process of this.processes.values()) {
			if (process.status === 'ready') {
				readyShards += process.shardIds.length;
			}
		}

		const isAllReady = readyShards === this.shardCount;
		if (isAllReady && !this.previouslyAllReady) {
			logger.info(`All ${this.shardCount} shards are now ready!`);
			this.notifier.allShardsReady(this.shardCount).catch((err) => logger.error('Failed to notify all shards ready', err));
		}
		this.previouslyAllReady = isAllReady;
	}

	public updateStats(wsId: string, stats: ShardStatsPayload): void {
		const process = this.processes.get(wsId);
		if (process) {
			process.guilds = stats.guilds;
			process.players = stats.players;
			process.memoryUsage = stats.memoryUsage;
			process.uptime = stats.uptime;
		}
	}

	/** 반환에서 wsConnection은 제외해요. */
	public getAllProcesses(): Array<Omit<ShardProcessInfo, 'wsConnection'> & { wsId: string }> {
		return Array.from(this.processes.entries()).map(([wsId, info]) => {
			const { wsConnection, ...rest } = info;
			return { wsId, ...rest };
		});
	}

	public getProcessByShardId(shardId: number): (Omit<ShardProcessInfo, 'wsConnection'> & { wsId: string }) | null {
		for (const [wsId, info] of this.processes.entries()) {
			if (info.shardIds.includes(shardId)) {
				const { wsConnection, ...rest } = info;
				return { wsId, ...rest };
			}
		}
		return null;
	}

	public getAggregateStats() {
		let totalGuilds = 0;
		let totalPlayers = 0;
		let totalMemory = 0;

		for (const process of this.processes.values()) {
			totalGuilds += process.guilds;
			totalPlayers += process.players;
			totalMemory += process.memoryUsage;
		}

		return {
			shardCount: this.shardCount,
			shardsPerProcess: this.shardsPerProcess,
			processCount: this.processes.size,
			allocatedShards: this.allocatedShards.size,
			totalGuilds,
			totalPlayers,
			totalMemoryMB: Math.round(totalMemory / 1024 / 1024)
		};
	}

	public getShardCount() {
		return this.shardCount;
	}

	public getShardsPerProcess() {
		return this.shardsPerProcess;
	}

	private startHeartbeatMonitor(): void {
		this.heartbeatTimer = setInterval(() => {
			const now = Date.now();
			for (const [wsId, process] of this.processes.entries()) {
				if (now - process.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
					logger.warn(`Process ${wsId} heartbeat timeout (shards: [${process.shardIds.join(', ')}])`);
					this.notifier.shardHeartbeatTimeout(wsId, process.shardIds);
					process.status = 'disconnected';
					try {
						process.wsConnection.close();
					} catch {
						// 이미 끊긴 소켓 close 실패는 무해해요
					}
					this.release(wsId);
				}
			}
		}, HEARTBEAT_CHECK_INTERVAL_MS);
	}

	public destroy(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
		}
	}
}
