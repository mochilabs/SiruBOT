import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import {
	type WsMessage,
	type IdentifyPayload,
	type HeartbeatPayload,
	type ShardStatusPayload,
	type ShardStatsPayload,
	WsOp,
	WsMessageSchema
} from '@sirubot/shardclient/ws-types';
import { getLogger } from '../../utils/logger.ts';
import { timingSafeKeyEqual } from '@sirubot/app-kit';

const logger = getLogger('websocket');

let wsIdCounter = 0;

/** IDENTIFY 없이 유지되는 소켓의 최대 대기 시간 (미식별 소켓 회수) */
const IDENTIFY_TIMEOUT_MS = 30_000;

function send<T>(socket: WebSocket, message: WsMessage<T>) {
	socket.send(JSON.stringify(message));
}

export default async function routes(fastify: FastifyInstance) {
	const HEARTBEAT_INTERVAL = 30_000;

	fastify.get('/', { websocket: true }, (socket, _request) => {
		const wsId = `ws-${++wsIdCounter}`;
		logger.info(`[${wsId}] WebSocket connection established`);

		const registry = fastify.manager.getRegistry();
		const notifier = fastify.manager.getNotifier();
		const wsAuthKey = fastify.manager.getAuthKey() ?? '';

		// 미식별 소켓 수명 제한: IDENTIFY 없이 붙어만 있는 소켓은 하트비트 회수 대상이 아니라 그대로 쌓여요.
		const identifyTimeout = setTimeout(() => {
			if (!registry.getProcess(wsId)) {
				logger.warn(`[${wsId}] Identify timeout: closing unidentified socket`);
				socket.close(4002, 'Identify timeout');
			}
		}, IDENTIFY_TIMEOUT_MS);

		send(socket, {
			op: WsOp.HELLO,
			payload: {
				shardCount: registry.getShardCount(),
				shardsPerProcess: registry.getShardsPerProcess(),
				heartbeatInterval: HEARTBEAT_INTERVAL
			}
		});

		socket.on('message', (raw) => {
			try {
				const parsed = JSON.parse(raw.toString());
				const message = WsMessageSchema.parse(parsed);

				if (message.op !== WsOp.IDENTIFY && !registry.getProcess(wsId)) {
					logger.warn(`[${wsId}] Rejected op ${message.op}: socket is not identified`);
					return;
				}

				switch (message.op) {
					case WsOp.IDENTIFY:
						handleIdentify(wsId, socket, message.payload as IdentifyPayload);
						break;
					case WsOp.HEARTBEAT:
						handleHeartbeat(wsId, socket, message.payload as HeartbeatPayload);
						break;
					case WsOp.SHARD_STATUS:
						handleShardStatus(wsId, message.payload as ShardStatusPayload);
						break;
					case WsOp.SHARD_STATS:
						handleShardStats(wsId, message.payload as ShardStatsPayload);
						break;
					default:
						logger.warn(`[${wsId}] Unknown op: ${(message as any).op}`);
				}
			} catch (error) {
				logger.error(`[${wsId}] Message parse error:`, error);
			}
		});

		socket.on('close', () => {
			clearTimeout(identifyTimeout);
			logger.info(`[${wsId}] WebSocket connection closed`);
			// Get hostname before releasing
			const processInfo = registry.getProcess(wsId);
			const hostname = processInfo?.hostname;
			const released = registry.release(wsId);
			if (released) {
				logger.info(`[${wsId}] Released shards: [${released.join(', ')}]`);
				notifier.shardDisconnected(wsId, released, hostname);
			}
		});

		socket.on('error', (error) => {
			logger.error(`[${wsId}] WebSocket error:`, error);
		});

		function handleIdentify(id: string, ws: WebSocket, payload: IdentifyPayload) {
			// 같은 소켓에서의 재-IDENTIFY는 정당한 흐름이 아니에요. 이전 등록을 갱신하면
			// 이전 샤드 ID가 할당 집합에 남아 영구히 유출됩니다(할당 고갈 DoS 방지, SEC-003).
			if (registry.getProcess(id)) {
				logger.warn(`[${id}] IDENTIFY rejected: socket is already identified`);
				return;
			}

			// Authorization 헤더는 이미 검증됐지만, IDENTIFY payload의 토큰도 이중으로 검증해요.
			if (!payload.token || !wsAuthKey || !timingSafeKeyEqual(payload.token, wsAuthKey)) {
				logger.warn(`[${id}] IDENTIFY rejected: invalid identify token`);
				send(ws, {
					op: WsOp.IDENTIFY_ACK,
					payload: { shardIds: [], shardCount: 0 }
				});
				ws.close(4008, 'Invalid identify token');
				return;
			}

			let shardIds: number[] | null;

			// Re-identification: bot sends its current shard IDs. 정수·범위·점유 상태를 검증해요.
			if (payload.shardIds && payload.shardIds.length > 0) {
				logger.info(`[${id}] Re-identifying with existing shards [${payload.shardIds.join(', ')}]`);
				shardIds = registry.claimShards(id, payload.shardIds);
				if (!shardIds) {
					logger.warn(`[${id}] IDENTIFY rejected: invalid or already-claimed shard ids [${payload.shardIds.join(', ')}]`);
					send(ws, {
						op: WsOp.IDENTIFY_ACK,
						payload: { shardIds: [], shardCount: 0 }
					});
					ws.close(4002, 'Invalid shard ids');
					return;
				}
			} else {
				shardIds = registry.allocateShardIds();
			}

			if (!shardIds) {
				logger.warn(`[${id}] No shards available, closing connection`);
				send(ws, {
					op: WsOp.IDENTIFY_ACK,
					payload: { shardIds: [], shardCount: 0 }
				});
				ws.close(4000, 'No shards available');
				return;
			}

			registry.register(id, shardIds, ws, payload.hostname);
			clearTimeout(identifyTimeout);

			send(ws, {
				op: WsOp.IDENTIFY_ACK,
				payload: {
					shardIds,
					shardCount: registry.getShardCount()
				}
			});

			notifier.shardConnected(id, shardIds, payload.hostname);

			logger.info(
				`[${id}] Identified with shards [${shardIds.join(', ')}] / ${registry.getShardCount()}${payload.hostname ? ` (host: ${payload.hostname})` : ''}`
			);
		}

		function handleHeartbeat(id: string, ws: WebSocket, payload: HeartbeatPayload) {
			registry.heartbeat(id);
			send(ws, {
				op: WsOp.HEARTBEAT_ACK,
				payload: { timestamp: payload.timestamp }
			});
		}

		function handleShardStatus(id: string, payload: ShardStatusPayload) {
			registry.updateStatus(id, payload.status);

			if (payload.status === 'ready') {
				const process = registry.getProcess(id);
				if (process) {
					notifier.shardReady(id, process.shardIds, process.hostname);
				}
			}
		}

		function handleShardStats(id: string, payload: ShardStatsPayload) {
			registry.updateStats(id, payload);
		}
	});
}
