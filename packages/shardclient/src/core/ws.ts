import WebSocket from 'ws';
import { type ILogger } from '../types/logger.ts';
import { type WsMessage, WsMessageSchema } from '../ws-types/index.ts';

export type WebsocketOptions = {
	logger: ILogger;
	serverURL: string;
	authKey?: string;
};

/** 서버 연결(open)까지 기다리는 최대 시간 */
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

			// Close any existing connection before creating a new one
			if (this.ws) {
				try {
					this.ws.removeAllListeners();
					this.ws.on('error', () => {}); // 후행 에러가 unhandled 'error'로 터지지 않게 흡수해요
					this.ws.terminate();
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
				const socket = new WebSocket(this.serverURL, options);
				this.ws = socket;

				// open 이전에 close만 오거나(error 없이) 응답이 없으면 Promise가 영원히 pending이라 상한을 둬요.
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
						// manager와 동일하게 zod 스키마로 검증: 깨진/악의적 payload가
						// 핸들러에 전달되지 않도록 한다.
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
					// Do NOT auto-reconnect. Let the caller handle reconnection.
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

	/** 응답 없는 반쯤 끊긴(half-open) 소켓을 강제로 끊어요. 이후 close 이벤트로 재연결 흐름이 이어져요. */
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
