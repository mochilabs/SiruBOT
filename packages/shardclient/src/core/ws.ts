import WebSocket from 'ws';
import { type ILogger } from '../types/logger.ts';
import type { WsMessage } from '../ws-types/index.ts';

export type WebsocketOptions = {
	logger: ILogger;
	serverURL: string;
	authKey?: string;
};

export type WsEventHandler = (message: WsMessage) => void;

export class ShardWebSocket {
	private ws: WebSocket | null = null;
	private readonly serverURL: string;
	private readonly logger: ILogger;
	private readonly authKey?: string;
	private handlers: Map<string, WsEventHandler[]> = new Map();
	private isDestroyed = false;
	private onCloseCallback: ((code: number, reason: string) => void) | null = null;

	constructor(options: WebsocketOptions) {
		this.logger = options.logger;
		this.serverURL = options.serverURL;
		this.authKey = options.authKey;
	}

	public connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.isDestroyed) {
				reject(new Error('WebSocket is destroyed'));
				return;
			}

			// Close any existing connection before creating a new one
			if (this.ws) {
				try {
					this.ws.removeAllListeners();
					this.ws.close();
				} catch {
					// ignore close errors on old socket
				}
				this.ws = null;
			}

			try {
				const options: WebSocket.ClientOptions = {};
				if (this.authKey) {
					options.headers = { Authorization: this.authKey };
				}
				this.ws = new WebSocket(this.serverURL, options);

				this.ws.on('open', () => {
					this.logger.info(`Connected to shard manager: ${this.serverURL}`);
					resolve();
				});

				this.ws.on('message', (data) => {
					try {
						const message: WsMessage = JSON.parse(data.toString());
						this.emit(message.op, message);
					} catch (error) {
						this.logger.error('Failed to parse message:', error);
					}
				});

				this.ws.on('close', (code, reason) => {
					const reasonStr = reason.toString();
					this.logger.warn(`WebSocket closed: ${code} ${reasonStr}`);
					// Do NOT auto-reconnect — let the caller handle reconnection
					if (this.onCloseCallback) {
						this.onCloseCallback(code, reasonStr);
					}
				});

				this.ws.on('error', (error) => {
					this.logger.error('WebSocket error:', error);
					reject(error);
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * Set a callback for when the WebSocket closes (after successful connection).
	 * This is how the caller knows to handle reconnection or process exit.
	 */
	public onClose(callback: (code: number, reason: string) => void): void {
		this.onCloseCallback = callback;
	}

	public send<T>(message: WsMessage<T>): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		} else {
			this.logger.warn('WebSocket not connected, cannot send message');
		}
	}

	public on(op: string, handler: WsEventHandler): void {
		const handlers = this.handlers.get(op) || [];
		handlers.push(handler);
		this.handlers.set(op, handlers);
	}

	public removeAllListeners(op?: string): void {
		if (op) {
			this.handlers.delete(op);
		} else {
			this.handlers.clear();
		}
	}

	private emit(op: string, message: WsMessage): void {
		const handlers = this.handlers.get(op);
		if (handlers) {
			for (const handler of handlers) {
				handler(message);
			}
		}
	}

	public destroy(): void {
		this.isDestroyed = true;
		this.onCloseCallback = null;
		if (this.ws) {
			this.ws.removeAllListeners();
			this.ws.close();
		}
		this.handlers.clear();
	}
}
