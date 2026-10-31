import type { WebSocket } from '@fastify/websocket';
import { getLogger } from '../utils/logger.ts';
import type { WsMessage, ShardStatus, ShardStatsPayload } from '@sirubot/shardclient/ws-types';
import type { DiscordNotifier } from '../utils/discordNotifier.ts';

const logger = getLogger('shardRegistry');

const HEARTBEAT_TIMEOUT_MS = 60_000;
const HEARTBEAT_CHECK_INTERVAL_MS = 15_000;

/** A live process is never disconnected. The terminal state is absence from the registry. */
export type ProcessPhase = 'connecting' | 'ready' | 'errored';

interface ProcessRecord {
	phase: ProcessPhase;
	hostname?: string;
	guilds: number;
	players: number;
	memoryUsage: number;
	uptime: number;
	lastHeartbeat: number;
	connectedAt: number;
	wsConnection: WebSocket;
}

/** Wire-facing read view. Matches the existing API JSON shape exactly. */
export interface ProcessView {
	wsId: string;
	shardIds: number[];
	status: ProcessPhase;
	hostname?: string;
	guilds: number;
	players: number;
	memoryUsage: number;
	uptime: number;
	lastHeartbeat: number;
	connectedAt: number;
}

export type IdentifyResult =
	| { readonly kind: 'bound'; readonly shardIds: number[] }
	| { readonly kind: 'no-shards' }
	| { readonly kind: 'conflict'; readonly shardIds: number[] };

export interface Detached {
	shardIds: number[];
	hostname?: string;
}

export class ShardRegistry {
	/**
	 * Single source of truth for ownership. Each shard ID maps to at most one
	 * holder. Absence means free. There is no second store to desync.
	 */
	private readonly ownership = new Map<number, string>();

	private readonly processes = new Map<string, ProcessRecord>();
	private shardCount: number;
	private shardsPerProcess: number;
	private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
	private notifier: DiscordNotifier;
	private previouslyAllReady = false;

	constructor(shardCount: number, shardsPerProcess: number = 5, notifier: DiscordNotifier) {
		this.shardCount = shardCount;
		this.shardsPerProcess = shardsPerProcess;
		this.notifier = notifier;
		this.startHeartbeatMonitor();
	}

	/**
	 * Bind a process to shards, either fresh (no claim) or by reclaiming shards
	 * a re-identifying client reports. Reclaiming a shard held by a different
	 * live process is a hard conflict, never a silent takeover.
	 */
	public identify(wsId: string, ws: WebSocket, claim?: { shardIds: number[]; hostname?: string }): IdentifyResult {
		const existing = this.processes.get(wsId);

		if (existing) {
			if (!claim || claim.shardIds.length === 0) {
				return { kind: 'bound', shardIds: this.shardIdsOf(wsId) };
			}
			const result = this.claimBatch(wsId, claim.shardIds);
			if ('conflict' in result) {
				return { kind: 'conflict', shardIds: [result.conflict] };
			}
			this.releaseOwnedShards(wsId);
			for (const id of claim.shardIds) this.ownership.set(id, wsId);
			existing.phase = 'connecting';
			existing.hostname = claim.hostname ?? existing.hostname;
			existing.wsConnection = ws;
			return { kind: 'bound', shardIds: result.shardIds };
		}

		if (claim && claim.shardIds.length > 0) {
			const result = this.claimBatch(wsId, claim.shardIds);
			if ('conflict' in result) {
				return { kind: 'conflict', shardIds: [result.conflict] };
			}
			this.processes.set(wsId, {
				phase: 'connecting',
				hostname: claim.hostname,
				guilds: 0,
				players: 0,
				memoryUsage: 0,
				uptime: 0,
				lastHeartbeat: Date.now(),
				connectedAt: Date.now(),
				wsConnection: ws
			});
			return { kind: 'bound', shardIds: result.shardIds };
		}

		const allocated = this.allocateBatch(wsId);
		if (allocated === null) return { kind: 'no-shards' };

		this.processes.set(wsId, {
			phase: 'connecting',
			hostname: claim?.hostname,
			guilds: 0,
			players: 0,
			memoryUsage: 0,
			uptime: 0,
			lastHeartbeat: Date.now(),
			connectedAt: Date.now(),
			wsConnection: ws
		});

		return { kind: 'bound', shardIds: allocated };
	}

	/** Remove the process. Ownership is released by absence, so a shard can never be freed for the wrong holder. */
	public detach(wsId: string): Detached | undefined {
		const process = this.processes.get(wsId);
		if (!process) return undefined;

		const shardIds = this.shardIdsOf(wsId);
		this.releaseOwnedShards(wsId);
		this.processes.delete(wsId);
		this.checkAllShardsReady();

		return { shardIds, hostname: process.hostname };
	}

	public getProcess(wsId: string): ProcessView | undefined {
		return this.processes.has(wsId) ? this.viewOf(wsId) : undefined;
	}

	public heartbeat(wsId: string): void {
		const process = this.processes.get(wsId);
		if (process) {
			process.lastHeartbeat = Date.now();
		}
	}

	public updateStatus(wsId: string, status: ShardStatus): void {
		if (status === 'disconnected') {
			this.detach(wsId);
			return;
		}
		if (status === 'ready' || status === 'errored') {
			const process = this.processes.get(wsId);
			if (!process) return;
			process.phase = status;
			this.checkAllShardsReady();
		}
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

	public getAllProcesses(): ProcessView[] {
		return Array.from(this.processes.keys()).map((wsId) => this.viewOf(wsId));
	}

	public getProcessByShardId(shardId: number): ProcessView | null {
		const owner = this.ownership.get(shardId);
		return owner === undefined ? null : this.viewOf(owner);
	}

	public getAllConnections(): WebSocket[] {
		return Array.from(this.processes.values()).map((p) => p.wsConnection);
	}

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
			allocatedShards: this.ownership.size,
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

	private allocateBatch(wsId: string): number[] | null {
		const batch: number[] = [];
		for (let id = 0; id < this.shardCount && batch.length < this.shardsPerProcess; id++) {
			if (!this.ownership.has(id)) {
				this.ownership.set(id, wsId);
				batch.push(id);
			}
		}

		if (batch.length === 0) {
			logger.warn('No available shard IDs to allocate');
			return null;
		}

		logger.info(`Allocated shard IDs: [${batch.join(', ')}]`);
		return batch;
	}

	private claimBatch(wsId: string, requested: number[]): { shardIds: number[] } | { conflict: number } {
		for (const id of requested) {
			if (id < 0 || id >= this.shardCount) return { conflict: id };
			const owner = this.ownership.get(id);
			if (owner !== undefined && owner !== wsId) return { conflict: id };
		}

		for (const id of requested) this.ownership.set(id, wsId);
		return { shardIds: Array.from(new Set(requested)) };
	}

	private releaseOwnedShards(wsId: string): void {
		for (const [shardId, owner] of this.ownership) {
			if (owner === wsId) this.ownership.delete(shardId);
		}
	}

	private shardIdsOf(wsId: string): number[] {
		const ids: number[] = [];
		for (const [shardId, owner] of this.ownership) {
			if (owner === wsId) ids.push(shardId);
		}
		return ids;
	}

	private viewOf(wsId: string): ProcessView {
		const process = this.processes.get(wsId)!;
		const { wsConnection, phase, ...rest } = process;
		return { wsId, shardIds: this.shardIdsOf(wsId), status: phase, ...rest };
	}

	private checkAllShardsReady(): void {
		const ready = new Set<number>();
		for (const [shardId, owner] of this.ownership) {
			if (this.processes.get(owner)?.phase === 'ready') ready.add(shardId);
		}

		const isAllReady = ready.size === this.shardCount;
		if (isAllReady && !this.previouslyAllReady) {
			logger.info(`All ${this.shardCount} shards are now ready!`);
			this.notifier.allShardsReady(this.shardCount).catch((err) => logger.error('Failed to notify all shards ready', err));
		}
		this.previouslyAllReady = isAllReady;
	}

	private startHeartbeatMonitor(): void {
		this.heartbeatTimer = setInterval(() => {
			const now = Date.now();
			for (const [wsId, process] of this.processes.entries()) {
				if (now - process.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
					logger.warn(`Process ${wsId} heartbeat timeout (shards: [${this.shardIdsOf(wsId).join(', ')}])`);
					this.notifier.shardHeartbeatTimeout(wsId, this.shardIdsOf(wsId));
					try {
						process.wsConnection.close();
					} catch {
						// ignore
					}
					this.detach(wsId);
				}
			}
		}, HEARTBEAT_CHECK_INTERVAL_MS);
	}

	public destroy(): void {
		clearInterval(this.heartbeatTimer);
	}
}
