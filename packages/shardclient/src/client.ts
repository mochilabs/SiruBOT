import { hostname } from 'node:os';
import { ILogger } from './types/logger.ts';
import { ShardWebSocket } from './core/ws.ts';
import { NoShardsAvailableError } from './errors/NoShardsAvailableError.ts';
import { WsOp, type HelloPayload, type IdentifyAckPayload, type ShardStatsPayload, type ShardStatusPayload } from './ws-types/index.ts';

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
	private isReconnecting = false;
	private isDestroyed = false;
	/** 직전 HEARTBEAT에 대한 ACK를 아직 못 받았는지: 다음 틱까지 못 받으면 소켓이 반쯤 끊긴 거예요 */
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

	/**
	 * Connect to shard manager and receive shard assignment
	 */
	public async identify(): Promise<ShardIdentity> {
		while (!this.isDestroyed) {
			try {
				this.ws.removeAllListeners();
				await this.ws.connect();

				return await this.sendIdentify({ withShardIds: false });
			} catch (error) {
				// Fatal: no shards available. Do not retry, let the process exit
				if (error instanceof NoShardsAvailableError) {
					throw error;
				}

				this.logger.error(
					`Failed to identify with shard manager: ${error instanceof Error ? error.message : String(error)}. Retrying in 5s...`
				);
				await new Promise((resolve) => setTimeout(resolve, 5_000));
			}
		}
		throw new Error('ShardClient is destroyed');
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
				await this.sendIdentify({ withShardIds: true });
				this.isReconnecting = false;
				this.logger.info('Successfully re-identified with shard manager');
				return;
			} catch (error) {
				// 재식별 거부(다른 프로세스가 점유 중이거나 ID가 유효하지 않음)도 계속 재시도하되, 원인을 구분해서 남겨요.
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

	/**
	 * Shared IDENTIFY handshake: wait for HELLO, send IDENTIFY (optionally with
	 * the current shard IDs for re-identification), then await IDENTIFY_ACK.
	 */
	private sendIdentify(options: { withShardIds: boolean }): Promise<ShardIdentity> {
		return new Promise<ShardIdentity>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('IDENTIFY_ACK timeout (10s)'));
			}, 10_000);

			this.ws.on(WsOp.HELLO, (msg) => {
				const hello = msg.payload as HelloPayload;
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

				// After successful identification, reconnect on disconnect
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
			// 직전 HEARTBEAT의 ACK가 한 주기(30s) 동안 오지 않았다면 연결이 반쯤 끊긴 거예요.
			// 그대로 두면 서버는 하트비트 타임아웃으로 샤드를 회수해 다른 프로세스에 줄 수 있는데
			// 이쪽은 계속 샤드를 가진 줄 알아요(이중 점유). 소켓을 끊어 close 콜백의 재연결로 보내요.
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
		}, 30_000);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
	}

	private startStatsReporter(): void {
		// onStats가 다시 불리면 이전 인터벌이 영구 누수되지 않게 먼저 정리해요 (startHeartbeat와 같은 규율).
		if (this.statsInterval) {
			clearInterval(this.statsInterval);
			this.statsInterval = null;
		}
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
		this.isDestroyed = true;
		this.isReconnecting = false;
		this.stopHeartbeat();
		if (this.statsInterval) clearInterval(this.statsInterval);
		this.ws.destroy();
	}
}
