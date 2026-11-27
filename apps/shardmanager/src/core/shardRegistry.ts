import type { WebSocket } from '@fastify/websocket';
import { getLogger } from '../utils/logger.ts';
import type { ShardStatus, ShardStatsPayload } from '@sirubot/shardclient/ws-types';
import type { DiscordNotifier } from '../utils/discordNotifier.ts';

const logger = getLogger('shardRegistry');

export const HEARTBEAT_TIMEOUT_MS = 60_000;
const HEARTBEAT_CHECK_INTERVAL_MS = 15_000;

const WS_CLOSING = 2;
const WS_CLOSED = 3;

const BYTES_PER_MB = 1024 * 1024;

export interface ShardRegistryOptions {
	/** 재시작 직후 기존 봇의 re-identify가 끝날 때까지 신규 할당을 보류하는 시간(ms). */
	allocationGraceMs?: number;
}

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

type ProcessSnapshot = Omit<ShardProcessInfo, 'wsConnection'> & { wsId: string };

function snapshotOf(wsId: string, info: ShardProcessInfo): ProcessSnapshot {
	const { wsConnection, ...rest } = info;
	return { wsId, ...rest };
}

function isSocketClosing(socket: WebSocket): boolean {
	return socket.readyState === WS_CLOSING || socket.readyState === WS_CLOSED;
}

export class ShardRegistry {
	private processes: Map<string, ShardProcessInfo> = new Map();
	private allocatedShards: Set<number> = new Set();
	private shardCount: number;
	private shardsPerProcess: number;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private notifier: DiscordNotifier;
	private previouslyAllReady: boolean = false;
	private readonly allocationGraceUntil: number;

	constructor(shardCount: number, shardsPerProcess: number = 5, notifier: DiscordNotifier, options: ShardRegistryOptions = {}) {
		this.shardCount = shardCount;
		this.shardsPerProcess = shardsPerProcess;
		this.notifier = notifier;
		this.allocationGraceUntil = Date.now() + (options.allocationGraceMs ?? 0);
		this.startHeartbeatMonitor();
	}

	public allocateShardIds(): number[] | null {
		if (Date.now() < this.allocationGraceUntil) {
			logger.info('New shard allocation deferred: startup grace period (existing processes may still be re-identifying)');
			return null;
		}

		const available = this.findFreeShardIds(this.shardsPerProcess);

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

	private findFreeShardIds(limit: number): number[] {
		const free: number[] = [];
		for (let id = 0; id < this.shardCount && free.length < limit; id++) {
			if (!this.allocatedShards.has(id)) free.push(id);
		}
		return free;
	}

	private isValidShardId(shardId: number): boolean {
		return Number.isInteger(shardId) && shardId >= 0 && shardId < this.shardCount;
	}

	/** Re-identify 시 요청된 샤드 ID를 검증·점유하며, 끊긴 소켓의 잔여 점유는 회수하고 하나라도 유효하지 않으면 null을 반환해요. */
	public claimShards(wsId: string, requested: number[]): number[] | null {
		const claimed: number[] = [];
		const seen = new Set<number>();

		for (const shardId of requested) {
			if (!this.isValidShardId(shardId) || seen.has(shardId)) return null;
			seen.add(shardId);

			const owner = this.findShardOwner(shardId);
			if (owner && owner.wsId !== wsId) {
				if (!isSocketClosing(owner.info.wsConnection)) return null;
				// stale registration of a dead socket: detach so a later release doesn't free this ID again
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
		const info = this.processes.get(wsId);
		if (!info) return undefined;

		const released = info.shardIds;
		for (const id of released) {
			this.allocatedShards.delete(id);
		}
		this.processes.delete(wsId);

		logger.info(`Released process ${wsId}, freed shards [${released.join(', ')}]`);
		this.checkAllShardsReady();
		return released;
	}

	public heartbeat(wsId: string): void {
		const info = this.processes.get(wsId);
		if (info) info.lastHeartbeat = Date.now();
	}

	public updateStatus(wsId: string, status: ShardStatus): void {
		const info = this.processes.get(wsId);
		if (!info) return;

		info.status = status;
		logger.info(`Process ${wsId} status: ${status}`);
		this.checkAllShardsReady();
	}

	private checkAllShardsReady(): void {
		let readyShards = 0;
		for (const info of this.processes.values()) {
			if (info.status === 'ready') readyShards += info.shardIds.length;
		}

		const isAllReady = readyShards === this.shardCount;
		if (isAllReady && !this.previouslyAllReady) {
			logger.info(`All ${this.shardCount} shards are now ready!`);
			this.notifier.allShardsReady(this.shardCount).catch((err) => logger.error('Failed to notify all shards ready', err));
		}
		this.previouslyAllReady = isAllReady;
	}

	public updateStats(wsId: string, stats: ShardStatsPayload): void {
		const info = this.processes.get(wsId);
		if (!info) return;

		info.guilds = stats.guilds;
		info.players = stats.players;
		info.memoryUsage = stats.memoryUsage;
		info.uptime = stats.uptime;
	}

	public getAllProcesses(): ProcessSnapshot[] {
		return Array.from(this.processes.entries()).map(([wsId, info]) => snapshotOf(wsId, info));
	}

	public getProcessByShardId(shardId: number): ProcessSnapshot | null {
		const owner = this.findShardOwner(shardId);
		return owner ? snapshotOf(owner.wsId, owner.info) : null;
	}

	public getAggregateStats() {
		let totalGuilds = 0;
		let totalPlayers = 0;
		let totalMemory = 0;

		for (const info of this.processes.values()) {
			totalGuilds += info.guilds;
			totalPlayers += info.players;
			totalMemory += info.memoryUsage;
		}

		return {
			shardCount: this.shardCount,
			shardsPerProcess: this.shardsPerProcess,
			processCount: this.processes.size,
			allocatedShards: this.allocatedShards.size,
			totalGuilds,
			totalPlayers,
			totalMemoryMB: Math.round(totalMemory / BYTES_PER_MB)
		};
	}

	public getShardCount() {
		return this.shardCount;
	}

	public getShardsPerProcess() {
		return this.shardsPerProcess;
	}

	private startHeartbeatMonitor(): void {
		this.heartbeatTimer = setInterval(() => this.releaseStaleProcesses(), HEARTBEAT_CHECK_INTERVAL_MS);
	}

	private releaseStaleProcesses(): void {
		const now = Date.now();
		for (const [wsId, info] of this.processes.entries()) {
			if (now - info.lastHeartbeat <= HEARTBEAT_TIMEOUT_MS) continue;

			logger.warn(`Process ${wsId} heartbeat timeout (shards: [${info.shardIds.join(', ')}])`);
			this.notifier.shardHeartbeatTimeout(wsId, info.shardIds);
			info.status = 'disconnected';
			try {
				info.wsConnection.close();
			} catch {}
			this.release(wsId);
		}
	}

	public destroy(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
		}
	}
}
