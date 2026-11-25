import WebSocket from 'ws';
import { type ILogger } from '../types/logger.ts';
import { type WsMessage, WsMessageSchema } from '../ws-types/index.ts';

export type WebsocketOptions = {
	logger: ILogger;
	serverURL: string;
	authKey?: string;
};

const CONNECT_TIMEOUT_MS = 10_000;

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

			if (this.ws) {
				try {
					this.ws.removeAllListeners();
					this.ws.on('error', () => {}); // swallow trailing errors so they don't surface as unhandled
					this.ws.terminate();
				} catch {
					// the old socket is being discarded anyway
				}
				this.ws = null;
			}

			try {
				const options: WebSocket.ClientOptions = {};
				if (this.authKey) {
					options.headers = { Authorization: this.authKey };
				}
				const socket = new WebSocket(this.serverURL, options);
				this.ws = socket;

				// close without error, or silence, before open would leave this promise pending forever.
				let opened = false;
				const connectTimeout = setTimeout(() => {
					if (opened) return;
					reject(new Error(`WebSocket connect timeout (${CONNECT_TIMEOUT_MS / 1000}s)`));
					socket.terminate();
				}, CONNECT_TIMEOUT_MS);

				socket.on('open', () => {
					opened = true;
					clearTimeout(connectTimeout);
					this.logger.info(`Connected to shard manager: ${this.serverURL}`);
					resolve();
				});

				socket.on('message', (data) => {
					try {
						const parsed: unknown = JSON.parse(data.toString());
						const message = WsMessageSchema.parse(parsed);
						this.emit(message.op, message);
					} catch (error) {
						this.logger.error('Failed to parse/validate message:', error);
					}
				});

				socket.on('close', (code, reason) => {
					clearTimeout(connectTimeout);
					const reasonStr = reason.toString();
					this.logger.warn(`WebSocket closed: ${code} ${reasonStr}`);
					if (!opened) reject(new Error(`WebSocket closed before open: ${code} ${reasonStr}`));
					if (opened && this.onCloseCallback) {
						this.onCloseCallback(code, reasonStr);
					}
				});

				socket.on('error', (error) => {
					this.logger.error('WebSocket error:', error);
					clearTimeout(connectTimeout);
					reject(error);
				});
			} catch (error) {
				reject(error);
			}
		});
	}

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

	public terminate(): void {
		this.ws?.terminate();
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
