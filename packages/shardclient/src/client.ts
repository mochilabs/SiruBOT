import { hostname } from 'node:os';
import { ILogger } from './types/logger.ts';
import { ShardWebSocket } from './core/ws.ts';
import { NoShardsAvailableError } from './errors/NoShardsAvailableError.ts';
import {
	WsOp,
	type HelloPayload,
	type IdentifyAckPayload,
	type ShardStatsPayload,
	type ShardStatusPayload,
	type BroadcastEvalPayload
} from './ws-types/index.ts';

export type ShardClientOptions = {
	logger: ILogger;
	serverURL: string;
	authToken?: string; // Discord token for IDENTIFY payload
	authKey?: string; // Auth key for Shard Manager connection (Authorization header)
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
	private statsInterval: ReturnType<typeof setInterval> | null = null;
	private identity: ShardIdentity | null = null;
	private statsCallback: (() => Omit<ShardStatsPayload, 'shardIds'>) | null = null;
	private evalCallback: ((script: string) => Promise<unknown>) | null = null;
	private isReconnecting = false;

	constructor(options: ShardClientOptions) {
		this.logger = options.logger;
		this.authToken = options.authToken ?? '';
		this.ws = new ShardWebSocket({
			logger: options.logger,
			serverURL: options.serverURL,
			authKey: options.authKey
		});
	}

	/**
	 * Connect to shard manager and receive shard assignment
	 */
	public async identify(): Promise<ShardIdentity> {
		// eslint-disable-next-line no-constant-condition
		while (true) {
			try {
				this.ws.removeAllListeners();
				await this.ws.connect();

				return await new Promise<ShardIdentity>((resolve, reject) => {
					const timeout = setTimeout(() => {
						reject(new Error('IDENTIFY_ACK timeout (10s)'));
					}, 10_000);

					// Wait for HELLO, then send IDENTIFY
					this.ws.on(WsOp.HELLO, (msg) => {
						const hello = msg.payload as HelloPayload;
						this.logger.info(
							`Received HELLO: ${hello.shardCount} shards, ${hello.shardsPerProcess}/process, heartbeat ${hello.heartbeatInterval}ms`
						);

						// Send IDENTIFY (first time, no shardIds)
						this.ws.send({
							op: WsOp.IDENTIFY,
							payload: { token: this.authToken, hostname: hostname() }
						});
					});

					// Wait for IDENTIFY_ACK
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

						this.logger.info(`Identified: shards [${ack.shardIds.join(', ')}] / ${ack.shardCount}`);

						// Start heartbeat
						this.startHeartbeat();

						// Setup event handlers
						this.setupEventHandlers();

						// After successful identification, reconnect on disconnect
						this.ws.onClose((_code, reason) => {
							this.logger.warn(`Shard manager disconnected (${reason}). Will reconnect...`);
							this.stopHeartbeat();
							this.reconnect();
						});

						resolve(this.identity);
					});
				});
			} catch (error) {
				// Fatal: no shards available — do not retry, let the process exit
				if (error instanceof NoShardsAvailableError) {
					throw error;
				}

				this.logger.error(
					`Failed to identify with shard manager: ${error instanceof Error ? error.message : String(error)}. Retrying in 5s...`
				);
				await new Promise((resolve) => setTimeout(resolve, 5_000));
			}
		}
	}

	/**
	 * Reconnect to shard manager and re-identify with current shard IDs
	 */
	private async reconnect(): Promise<void> {
		if (this.isReconnecting) return;
		this.isReconnecting = true;

		let attempt = 0;
		const maxDelay = 30_000;

		while (this.isReconnecting) {
			attempt++;
			const delay = Math.min(1000 * Math.pow(2, attempt - 1), maxDelay);
			this.logger.info(`Reconnecting to shard manager in ${delay}ms (attempt ${attempt})...`);
			await new Promise((resolve) => setTimeout(resolve, delay));

			try {
				this.ws.removeAllListeners();
				await this.ws.connect();
				await this.reidentify();
				this.isReconnecting = false;
				this.logger.info('Successfully re-identified with shard manager');
				return;
			} catch (error) {
				this.logger.warn(`Reconnect attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	/**
	 * Re-identify with shard manager, sending current shard IDs
	 */
	private reidentify(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('Re-IDENTIFY_ACK timeout (10s)'));
			}, 10_000);

			// Wait for HELLO
			this.ws.on(WsOp.HELLO, () => {
				// Send IDENTIFY with current shard IDs
				this.ws.send({
					op: WsOp.IDENTIFY,
					payload: {
						token: this.authToken,
						shardIds: this.identity?.shardIds,
						hostname: hostname()
					}
				});
			});

			// Wait for IDENTIFY_ACK
			this.ws.on(WsOp.IDENTIFY_ACK, (msg) => {
				clearTimeout(timeout);
				const ack = msg.payload as IdentifyAckPayload;

				if (ack.shardIds.length === 0) {
					reject(new Error('Re-identification failed: no shards assigned'));
					return;
				}

				this.logger.info(`Re-identified: shards [${ack.shardIds.join(', ')}] / ${ack.shardCount}`);

				// Restart heartbeat
				this.startHeartbeat();

				// Setup event handlers
				this.setupEventHandlers();

				// Re-register onClose for next disconnect
				this.ws.onClose((_code, reason) => {
					this.logger.warn(`Shard manager disconnected again (${reason}). Will reconnect...`);
					this.stopHeartbeat();
					this.reconnect();
				});

				resolve();
			});
		});
	}

	/**
	 * Setup persistent event handlers (heartbeat ack, broadcast eval)
	 */
	private setupEventHandlers(): void {
		// Handle HEARTBEAT_ACK
		this.ws.on(WsOp.HEARTBEAT_ACK, () => {
			// heartbeat acknowledged
		});

		// Handle BROADCASTEVAL
		this.ws.on(WsOp.BROADCASTEVAL, async (msg) => {
			const payload = msg.payload as BroadcastEvalPayload;
			if (this.evalCallback) {
				try {
					const result = await this.evalCallback(payload.script);
					this.ws.send({
						op: WsOp.BROADCASTEVAL_RESULT,
						payload: { id: payload.id, result }
					});
				} catch (error) {
					this.ws.send({
						op: WsOp.BROADCASTEVAL_RESULT,
						payload: {
							id: payload.id,
							result: null,
							error: error instanceof Error ? error.message : String(error)
						}
					});
				}
			}
		});
	}

	/**
	 * Report shard status
	 */
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

	/**
	 * Set callback for collecting stats
	 */
	public onStats(callback: () => Omit<ShardStatsPayload, 'shardIds'>): void {
		this.statsCallback = callback;
		this.startStatsReporter();
	}

	/**
	 * Set callback for broadcastEval
	 */
	public onEval(callback: (script: string) => Promise<unknown>): void {
		this.evalCallback = callback;
	}

	public getIdentity(): ShardIdentity | null {
		return this.identity;
	}

	private startHeartbeat(): void {
		this.stopHeartbeat();
		this.heartbeatInterval = setInterval(() => {
			this.ws.send({
				op: WsOp.HEARTBEAT,
				payload: { timestamp: Date.now() }
			});
		}, 30_000);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
	}

	private startStatsReporter(): void {
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
		}, 60_000);
	}

	public destroy(): void {
		this.isReconnecting = false;
		this.stopHeartbeat();
		if (this.statsInterval) clearInterval(this.statsInterval);
		this.ws.destroy();
	}
}
