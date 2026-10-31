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
			const released = registry.detach(wsId);
			if (released) {
				logger.info(`[${wsId}] Released shards: [${released.shardIds.join(', ')}]`);
				notifier.shardDisconnected(wsId, released.shardIds, released.hostname);
			}
		});

		socket.on('error', (error) => {
			logger.error(`[${wsId}] WebSocket error:`, error);
		});

		// --- Handlers ---

		function handleIdentify(id: string, ws: WebSocket, payload: IdentifyPayload) {
			// Re-identify: the client claims its existing shards. First time: no claim means "give me free ones".
			const claim = payload.shardIds && payload.shardIds.length > 0 ? { shardIds: payload.shardIds, hostname: payload.hostname } : undefined;
			const result = registry.identify(id, ws, claim);

			if (result.kind === 'no-shards' || result.kind === 'conflict') {
				logger.warn(
					`[${id}] ${result.kind === 'conflict' ? `Shard conflict: [${result.shardIds.join(', ')}]` : 'No shards available'}, closing connection`
				);
				send(ws, {
					op: WsOp.IDENTIFY_ACK,
					payload: { shardIds: [], shardCount: 0 }
				});
				ws.close(4000, result.kind === 'conflict' ? 'Shard conflict' : 'No shards available');
				return;
			}

			const { shardIds } = result;

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
