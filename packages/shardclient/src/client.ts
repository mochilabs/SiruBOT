import { hostname } from 'node:os';
import { ILogger } from './types/logger.ts';
import { ShardWebSocket } from './core/ws.ts';
import { NoShardsAvailableError } from './errors/NoShardsAvailableError.ts';
import { WsOp, type HelloPayload, type IdentifyAckPayload, type ShardStatsPayload, type ShardStatusPayload } from './ws-types/index.ts';

const DEFAULT_HEARTBEAT_MS = 30_000;
const STATS_INTERVAL_MS = 60_000;
const IDENTIFY_ACK_TIMEOUT_MS = 10_000;
const IDENTIFY_RETRY_DELAY_MS = 5_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const RECONNECT_BASE_DELAY_MS = 1_000;

export type ShardClientOptions = {
	logger: ILogger;
	serverURL: string;
	authToken?: string;
	authKey?: string;
};

export interface ShardIdentity {
	shardIds: number[];
	shardCount: number;
}

export class ShardClient {
	private readonly logger: ILogger;
	private readonly ws: ShardWebSocket;
	private readonly authToken: string;
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private heartbeatMs = DEFAULT_HEARTBEAT_MS;
	private statsInterval: ReturnType<typeof setInterval> | null = null;
	private identity: ShardIdentity | null = null;
	private statsCallback: (() => Omit<ShardStatsPayload, 'shardIds'>) | null = null;
	private isReconnecting = false;
	private isDestroyed = false;
	private awaitingHeartbeatAck = false;

	constructor(options: ShardClientOptions) {
		this.logger = options.logger;
		this.authToken = options.authToken ?? options.authKey ?? '';
		this.ws = new ShardWebSocket({
			logger: options.logger,
			serverURL: options.serverURL,
			authKey: options.authKey
		});
	}

	public async identify(): Promise<ShardIdentity> {
		while (!this.isDestroyed) {
			try {
				this.ws.removeAllListeners();
				await this.ws.connect();

				return await this.sendIdentify({ withShardIds: false });
			} catch (error) {
				if (error instanceof NoShardsAvailableError) {
					throw error;
				}

				this.logger.error(
					`Failed to identify with shard manager: ${error instanceof Error ? error.message : String(error)}. Retrying in ${IDENTIFY_RETRY_DELAY_MS / 1000}s...`
				);
				await new Promise((resolve) => setTimeout(resolve, IDENTIFY_RETRY_DELAY_MS));
			}
		}
		throw new Error('ShardClient is destroyed');
	}

	private async reconnect(): Promise<void> {
		if (this.isReconnecting) return;
		this.isReconnecting = true;

		let attempt = 0;

		while (this.isReconnecting) {
			attempt++;
			const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS);
			this.logger.info(`Reconnecting to shard manager in ${delay}ms (attempt ${attempt})...`);
			await new Promise((resolve) => setTimeout(resolve, delay));

			try {
				this.ws.removeAllListeners();
				await this.ws.connect();
				await this.sendIdentify({ withShardIds: true });
				this.isReconnecting = false;
				this.logger.info('Successfully re-identified with shard manager');
				return;
			} catch (error) {
				const cause =
					error instanceof NoShardsAvailableError
						? 'shard manager rejected the shard claim (still held by another process, or invalid IDs)'
						: error instanceof Error
							? error.message
							: String(error);
				this.logger.warn(`Reconnect attempt ${attempt} failed: ${cause}`);
			}
		}
	}

	private sendIdentify(options: { withShardIds: boolean }): Promise<ShardIdentity> {
		return new Promise<ShardIdentity>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('IDENTIFY_ACK timeout (10s)'));
			}, IDENTIFY_ACK_TIMEOUT_MS);

			this.ws.on(WsOp.HELLO, (msg) => {
				const hello = msg.payload as HelloPayload;
				this.heartbeatMs = hello.heartbeatInterval > 0 ? hello.heartbeatInterval : DEFAULT_HEARTBEAT_MS;
				this.logger.info(
					`Received HELLO: ${hello.shardCount} shards, ${hello.shardsPerProcess}/process, heartbeat ${hello.heartbeatInterval}ms`
				);

				this.ws.send({
					op: WsOp.IDENTIFY,
					payload: options.withShardIds
						? { token: this.authToken, shardIds: this.identity?.shardIds, hostname: hostname() }
						: { token: this.authToken, hostname: hostname() }
				});
			});

			this.ws.on(WsOp.HEARTBEAT_ACK, () => {
				this.awaitingHeartbeatAck = false;
			});

			this.ws.on(WsOp.IDENTIFY_ACK, (msg) => {
				clearTimeout(timeout);
				const ack = msg.payload as IdentifyAckPayload;

				if (ack.shardIds.length === 0) {
					reject(new NoShardsAvailableError());
					return;
				}

				this.identity = {
					shardIds: ack.shardIds,
					shardCount: ack.shardCount
				};

				this.logger.info(`${options.withShardIds ? 'Re-identified' : 'Identified'}: shards [${ack.shardIds.join(', ')}] / ${ack.shardCount}`);

				this.startHeartbeat();

				this.ws.onClose((_code, reason) => {
					this.logger.warn(`Shard manager disconnected (${reason}). Will reconnect...`);
					this.stopHeartbeat();
					this.reconnect();
				});

				resolve(this.identity);
			});
		});
	}

	public reportStatus(status: ShardStatusPayload['status']): void {
		if (!this.identity) return;

		this.ws.send({
			op: WsOp.SHARD_STATUS,
			payload: {
				status,
				shardIds: this.identity.shardIds
			}
		});
	}

	public onStats(callback: () => Omit<ShardStatsPayload, 'shardIds'>): void {
		this.statsCallback = callback;
		this.startStatsReporter();
	}

	public getIdentity(): ShardIdentity | null {
		return this.identity;
	}

	private startHeartbeat(): void {
		this.stopHeartbeat();
		this.awaitingHeartbeatAck = false;
		this.heartbeatInterval = setInterval(() => {
			// A missed ACK means the socket is half-open: the server may reclaim our shards and hand
			// them to another process while we still think we own them. Force the close -> reconnect path.
			if (this.awaitingHeartbeatAck) {
				this.logger.warn('HEARTBEAT_ACK not received within one interval. Terminating connection to force reconnect...');
				this.awaitingHeartbeatAck = false;
				this.ws.terminate();
				return;
			}
			this.awaitingHeartbeatAck = true;
			this.ws.send({
				op: WsOp.HEARTBEAT,
				payload: { timestamp: Date.now() }
			});
		}, this.heartbeatMs);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
	}

	private stopStatsReporter(): void {
		if (this.statsInterval) {
			clearInterval(this.statsInterval);
			this.statsInterval = null;
		}
	}

	private startStatsReporter(): void {
		this.stopStatsReporter();
		this.statsInterval = setInterval(() => {
			if (!this.identity || !this.statsCallback) return;

			const stats = this.statsCallback();
			this.ws.send({
				op: WsOp.SHARD_STATS,
				payload: {
					shardIds: this.identity.shardIds,
					...stats
				}
			});
		}, STATS_INTERVAL_MS);
	}

	public destroy(): void {
		this.isDestroyed = true;
		this.isReconnecting = false;
		this.stopHeartbeat();
		this.stopStatsReporter();
		this.ws.destroy();
	}
}
