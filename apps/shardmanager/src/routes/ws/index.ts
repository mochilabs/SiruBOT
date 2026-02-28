import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import {
	type WsMessage,
	type IdentifyPayload,
	type HeartbeatPayload,
	type ShardStatusPayload,
	type ShardStatsPayload,
	type BroadcastEvalPayload,
	type BroadcastEvalResultPayload,
	WsOp,
	WsMessageSchema
} from '@sirubot/shardclient/ws-types';
import { getLogger } from '../../utils/logger.ts';

const logger = getLogger('websocket');

let wsIdCounter = 0;

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

		// Send HELLO
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
					case WsOp.BROADCASTEVAL:
						handleBroadcastEval(wsId, message.payload as BroadcastEvalPayload);
						break;
					case WsOp.BROADCASTEVAL_RESULT:
						handleBroadcastEvalResult(message.payload as BroadcastEvalResultPayload);
						break;
					default:
						logger.warn(`[${wsId}] Unknown op: ${(message as any).op}`);
				}
			} catch (error) {
				logger.error(`[${wsId}] Message parse error:`, error);
			}
		});

		socket.on('close', () => {
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

		// --- Handlers ---

		function handleIdentify(id: string, ws: WebSocket, payload: IdentifyPayload) {
			let shardIds: number[] | null;

			// Re-identification: bot sends its current shard IDs
			if (payload.shardIds && payload.shardIds.length > 0) {
				logger.info(`[${id}] Re-identifying with existing shards [${payload.shardIds.join(', ')}]`);
				// Mark these shards as allocated
				for (const shardId of payload.shardIds) {
					registry.forceAllocate(shardId);
				}
				shardIds = payload.shardIds;
			} else {
				// First-time identification: allocate new shards
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
				const allProcesses = registry.getAllProcesses();
				const matched = allProcesses.find((p: { wsId: string; shardIds: number[] }) => p.wsId === id);
				if (matched) {
					notifier.shardReady(id, matched.shardIds, matched.hostname);
				}
			}
		}

		function handleShardStats(id: string, payload: ShardStatsPayload) {
			registry.updateStats(id, payload);
		}

		function handleBroadcastEval(_fromId: string, payload: BroadcastEvalPayload) {
			// Forward to all connected processes
			registry.broadcast({
				op: WsOp.BROADCASTEVAL,
				payload
			});
		}

		function handleBroadcastEvalResult(payload: BroadcastEvalResultPayload) {
			// Forward result back to all (the requester will match by id)
			registry.broadcast({
				op: WsOp.BROADCASTEVAL_RESULT,
				payload
			});
		}
	});
}
