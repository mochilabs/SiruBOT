import type { WebSocket } from '@fastify/websocket';
import { getLogger } from '../utils/logger.ts';
import type { WsMessage, ShardStatus, ShardStatsPayload } from '@sirubot/shardclient/ws-types';
import type { DiscordNotifier } from '../utils/discordNotifier.ts';

const logger = getLogger('shardRegistry');

const HEARTBEAT_TIMEOUT_MS = 60_000;
const HEARTBEAT_CHECK_INTERVAL_MS = 15_000;

export interface ShardProcessInfo {
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

	constructor(shardCount: number, shardsPerProcess: number = 5, notifier: DiscordNotifier) {
		this.shardCount = shardCount;
		this.shardsPerProcess = shardsPerProcess;
		this.notifier = notifier;
		this.startHeartbeatMonitor();
	}

	/**
	 * Allocate the next available batch of shard IDs
	 */
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
	 * Force-allocate a specific shard ID (for re-identification)
	 */
	public forceAllocate(shardId: number): void {
		this.allocatedShards.add(shardId);
	}

	/**
	 * Register a new process connection
	 */
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

	/**
	 * Get process info by wsId
	 */
	public getProcess(wsId: string): ShardProcessInfo | undefined {
		return this.processes.get(wsId);
	}

	/**
	 * Release shards when a process disconnects
	 */
	public release(wsId: string): number[] | undefined {
		const process = this.processes.get(wsId);
		if (!process) return undefined;

		for (const id of process.shardIds) {
			this.allocatedShards.delete(id);
		}

		const released = process.shardIds;
		this.processes.delete(wsId);

		logger.info(`Released process ${wsId}, freed shards [${released.join(', ')}]`);
		return released;
	}

	/**
	 * Update heartbeat timestamp
	 */
	public heartbeat(wsId: string): void {
		const process = this.processes.get(wsId);
		if (process) {
			process.lastHeartbeat = Date.now();
		}
	}

	/**
	 * Update process status
	 */
	public updateStatus(wsId: string, status: ShardStatus): void {
		const process = this.processes.get(wsId);
		if (process) {
			process.status = status;
			logger.info(`Process ${wsId} status: ${status}`);
		}
	}

	/**
	 * Update process stats
	 */
	public updateStats(wsId: string, stats: ShardStatsPayload): void {
		const process = this.processes.get(wsId);
		if (process) {
			process.guilds = stats.guilds;
			process.players = stats.players;
			process.memoryUsage = stats.memoryUsage;
			process.uptime = stats.uptime;
		}
	}

	/**
	 * Get all process infos (without ws connections)
	 */
	public getAllProcesses(): Array<Omit<ShardProcessInfo, 'wsConnection'> & { wsId: string }> {
		return Array.from(this.processes.entries()).map(([wsId, info]) => {
			const { wsConnection, ...rest } = info;
			return { wsId, ...rest };
		});
	}

	/**
	 * Get a specific shard's process info
	 */
	public getProcessByShardId(shardId: number): (Omit<ShardProcessInfo, 'wsConnection'> & { wsId: string }) | null {
		for (const [wsId, info] of this.processes.entries()) {
			if (info.shardIds.includes(shardId)) {
				const { wsConnection, ...rest } = info;
				return { wsId, ...rest };
			}
		}
		return null;
	}

	/**
	 * Get all WebSocket connections for broadcasting
	 */
	public getAllConnections(): WebSocket[] {
		return Array.from(this.processes.values()).map((p) => p.wsConnection);
	}

	/**
	 * Send a message to all connected processes
	 */
	public broadcast<T>(message: WsMessage<T>): void {
		const payload = JSON.stringify(message);
		for (const process of this.processes.values()) {
			try {
				process.wsConnection.send(payload);
			} catch (error) {
				logger.error('Failed to broadcast:', error);
			}
		}
	}

	/**
	 * Get aggregate stats
	 */
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

	/**
	 * Monitor heartbeats and mark dead processes
	 */
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
						// ignore
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
