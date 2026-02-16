import WebSocket from "ws";
import { type ILogger } from "../types/logger.ts";
import type { WsMessage } from "../ws-types/index.ts";

export type WebsocketOptions = {
  logger: ILogger;
  serverURL: string;
};

export type WsEventHandler = (message: WsMessage) => void;

export class ShardWebSocket {
  private ws: WebSocket | null = null;
  private readonly serverURL: string;
  private readonly logger: ILogger;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private handlers: Map<string, WsEventHandler[]> = new Map();
  private isDestroyed = false;

  constructor(options: WebsocketOptions) {
    this.logger = options.logger;
    this.serverURL = options.serverURL;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverURL);

        this.ws.on("open", () => {
          this.logger.info(`Connected to shard manager: ${this.serverURL}`);
          this.reconnectAttempts = 0;
          resolve();
        });

        this.ws.on("message", (data) => {
          try {
            const message: WsMessage = JSON.parse(data.toString());
            this.emit(message.op, message);
          } catch (error) {
            this.logger.error("Failed to parse message:", error);
          }
        });

        this.ws.on("close", (code, reason) => {
          this.logger.warn(`WebSocket closed: ${code} ${reason.toString()}`);
          if (!this.isDestroyed) {
            this.attemptReconnect();
          }
        });

        this.ws.on("error", (error) => {
          this.logger.error("WebSocket error:", error);
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  public send<T>(message: WsMessage<T>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.logger.warn("WebSocket not connected, cannot send message");
    }
  }

  public on(op: string, handler: WsEventHandler): void {
    const handlers = this.handlers.get(op) || [];
    handlers.push(handler);
    this.handlers.set(op, handlers);
  }

  private emit(op: string, message: WsMessage): void {
    const handlers = this.handlers.get(op);
    if (handlers) {
      for (const handler of handlers) {
        handler(message);
      }
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error("Max reconnect attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    this.logger.info(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );

    setTimeout(() => {
      if (!this.isDestroyed) {
        this.connect().catch((error) => {
          this.logger.error("Reconnect failed:", error);
        });
      }
    }, delay);
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.ws?.close();
    this.handlers.clear();
  }
}
