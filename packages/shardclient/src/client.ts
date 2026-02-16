import { ILogger } from "./types/logger.ts";
import { ShardWebSocket } from "./core/ws.ts";
import {
  WsOp,
  type HelloPayload,
  type IdentifyAckPayload,
  type ShardStatsPayload,
  type ShardStatusPayload,
  type BroadcastEvalPayload,
} from "./ws-types/index.ts";

export type ShardClientOptions = {
  logger: ILogger;
  serverURL: string;
  authToken?: string;
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
  private statsCallback: (() => Omit<ShardStatsPayload, "shardIds">) | null =
    null;
  private evalCallback: ((script: string) => Promise<unknown>) | null = null;

  constructor(options: ShardClientOptions) {
    this.logger = options.logger;
    this.authToken = options.authToken ?? "";
    this.ws = new ShardWebSocket({
      logger: options.logger,
      serverURL: options.serverURL,
    });
  }

  /**
   * Connect to shard manager and receive shard assignment
   */
  public async identify(): Promise<ShardIdentity> {
    await this.ws.connect();

    return new Promise<ShardIdentity>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("IDENTIFY_ACK timeout (10s)"));
      }, 10_000);

      // Wait for HELLO, then send IDENTIFY
      this.ws.on(WsOp.HELLO, (msg) => {
        const hello = msg.payload as HelloPayload;
        this.logger.info(
          `Received HELLO: ${hello.shardCount} shards, ${hello.shardsPerProcess}/process, heartbeat ${hello.heartbeatInterval}ms`,
        );

        // Send IDENTIFY
        this.ws.send({
          op: WsOp.IDENTIFY,
          payload: { token: this.authToken },
        });
      });

      // Wait for IDENTIFY_ACK
      this.ws.on(WsOp.IDENTIFY_ACK, (msg) => {
        clearTimeout(timeout);
        const ack = msg.payload as IdentifyAckPayload;

        if (ack.shardIds.length === 0) {
          reject(new Error("No shards available"));
          return;
        }

        this.identity = {
          shardIds: ack.shardIds,
          shardCount: ack.shardCount,
        };

        this.logger.info(
          `Identified: shards [${ack.shardIds.join(", ")}] / ${ack.shardCount}`,
        );

        // Start heartbeat
        this.startHeartbeat();

        resolve(this.identity);
      });

      // Handle HEARTBEAT_ACK (just log)
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
              payload: { id: payload.id, result },
            });
          } catch (error) {
            this.ws.send({
              op: WsOp.BROADCASTEVAL_RESULT,
              payload: {
                id: payload.id,
                result: null,
                error: error instanceof Error ? error.message : String(error),
              },
            });
          }
        }
      });
    });
  }

  /**
   * Report shard status
   */
  public reportStatus(status: ShardStatusPayload["status"]): void {
    if (!this.identity) return;

    this.ws.send({
      op: WsOp.SHARD_STATUS,
      payload: {
        status,
        shardIds: this.identity.shardIds,
      },
    });
  }

  /**
   * Set callback for collecting stats
   */
  public onStats(callback: () => Omit<ShardStatsPayload, "shardIds">): void {
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
    this.heartbeatInterval = setInterval(() => {
      this.ws.send({
        op: WsOp.HEARTBEAT,
        payload: { timestamp: Date.now() },
      });
    }, 30_000);
  }

  private startStatsReporter(): void {
    this.statsInterval = setInterval(() => {
      if (!this.identity || !this.statsCallback) return;

      const stats = this.statsCallback();
      this.ws.send({
        op: WsOp.SHARD_STATS,
        payload: {
          shardIds: this.identity.shardIds,
          ...stats,
        },
      });
    }, 60_000);
  }

  public destroy(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.statsInterval) clearInterval(this.statsInterval);
    this.ws.destroy();
  }
}
