import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import {
	type WsMessage,
	type IdentifyPayload,
	type HeartbeatPayload,
	type ShardStatusPayload,
	WsOp,
	WsMessageSchema
} from '@sirubot/shardclient/ws-types';
import { getLogger } from '../../utils/logger.ts';
import { timingSafeKeyEqual } from '@sirubot/app-kit';

const logger = getLogger('websocket');

const HEARTBEAT_INTERVAL_MS = 30_000;
const IDENTIFY_TIMEOUT_MS = 30_000;

const CLOSE_NO_SHARDS = 4000;
const CLOSE_INVALID_SHARDS = 4002;
const CLOSE_IDENTIFY_TIMEOUT = 4002;
const CLOSE_INVALID_TOKEN = 4008;

let wsIdCounter = 0;

function send<T>(socket: WebSocket, message: WsMessage<T>) {
	socket.send(JSON.stringify(message));
}

function rejectIdentify(socket: WebSocket, closeCode: number, reason: string) {
	send(socket, { op: WsOp.IDENTIFY_ACK, payload: { shardIds: [], shardCount: 0 } });
	socket.close(closeCode, reason);
}

export default async function routes(fastify: FastifyInstance) {
	fastify.get('/', { websocket: true }, (socket, _request) => {
		const wsId = `ws-${++wsIdCounter}`;
		logger.info(`[${wsId}] WebSocket connection established`);

		const registry = fastify.manager.getRegistry();
		const notifier = fastify.manager.getNotifier();
		const wsAuthKey = fastify.manager.getAuthKey() ?? '';

		// The heartbeat monitor only reclaims identified processes, so a socket that never identifies would otherwise pile up.
		const identifyTimeout = setTimeout(() => {
			if (registry.getProcess(wsId)) return;
			logger.warn(`[${wsId}] Identify timeout: closing unidentified socket`);
			socket.close(CLOSE_IDENTIFY_TIMEOUT, 'Identify timeout');
		}, IDENTIFY_TIMEOUT_MS);

		send(socket, {
			op: WsOp.HELLO,
			payload: {
				shardCount: registry.getShardCount(),
				shardsPerProcess: registry.getShardsPerProcess(),
				heartbeatInterval: HEARTBEAT_INTERVAL_MS
			}
		});

		socket.on('message', (raw) => {
			try {
				const message = WsMessageSchema.parse(JSON.parse(raw.toString()));

				if (message.op !== WsOp.IDENTIFY && !registry.getProcess(wsId)) {
					logger.warn(`[${wsId}] Rejected op ${message.op}: socket is not identified`);
					return;
				}

				switch (message.op) {
					case WsOp.IDENTIFY:
						handleIdentify(message.payload);
						break;
					case WsOp.HEARTBEAT:
						handleHeartbeat(message.payload);
						break;
					case WsOp.SHARD_STATUS:
						handleShardStatus(message.payload);
						break;
					case WsOp.SHARD_STATS:
						registry.updateStats(wsId, message.payload);
						break;
					default:
						logger.warn(`[${wsId}] Unknown op: ${message.op}`);
				}
			} catch (error) {
				logger.error(`[${wsId}] Message parse error:`, error);
			}
		});

		socket.on('close', () => {
			clearTimeout(identifyTimeout);
			logger.info(`[${wsId}] WebSocket connection closed`);
			const hostname = registry.getProcess(wsId)?.hostname;
			const released = registry.release(wsId);
			if (released) {
				logger.info(`[${wsId}] Released shards: [${released.join(', ')}]`);
				notifier.shardDisconnected(wsId, released, hostname);
			}
		});

		socket.on('error', (error) => {
			logger.error(`[${wsId}] WebSocket error:`, error);
		});

		function handleIdentify(payload: IdentifyPayload) {
			// Refreshing an existing registration would leak its old shard IDs in the allocated set forever (allocation exhaustion DoS).
			if (registry.getProcess(wsId)) {
				logger.warn(`[${wsId}] IDENTIFY rejected: socket is already identified`);
				return;
			}

			// The Authorization header was already verified; the identify token is a second check.
			if (!payload.token || !wsAuthKey || !timingSafeKeyEqual(payload.token, wsAuthKey)) {
				logger.warn(`[${wsId}] IDENTIFY rejected: invalid identify token`);
				rejectIdentify(socket, CLOSE_INVALID_TOKEN, 'Invalid identify token');
				return;
			}

			const isReidentify = Boolean(payload.shardIds && payload.shardIds.length > 0);
			const shardIds = isReidentify ? claimRequestedShards(payload.shardIds!) : registry.allocateShardIds();

			if (!shardIds) {
				if (isReidentify) {
					logger.warn(`[${wsId}] IDENTIFY rejected: invalid or already-claimed shard ids [${payload.shardIds!.join(', ')}]`);
					rejectIdentify(socket, CLOSE_INVALID_SHARDS, 'Invalid shard ids');
				} else {
					logger.warn(`[${wsId}] No shards available, closing connection`);
					rejectIdentify(socket, CLOSE_NO_SHARDS, 'No shards available');
				}
				return;
			}

			registry.register(wsId, shardIds, socket, payload.hostname);
			clearTimeout(identifyTimeout);

			send(socket, { op: WsOp.IDENTIFY_ACK, payload: { shardIds, shardCount: registry.getShardCount() } });

			notifier.shardConnected(wsId, shardIds, payload.hostname);

			logger.info(
				`[${wsId}] Identified with shards [${shardIds.join(', ')}] / ${registry.getShardCount()}${payload.hostname ? ` (host: ${payload.hostname})` : ''}`
			);
		}

		function claimRequestedShards(requested: number[]): number[] | null {
			logger.info(`[${wsId}] Re-identifying with existing shards [${requested.join(', ')}]`);
			return registry.claimShards(wsId, requested);
		}

		function handleHeartbeat(payload: HeartbeatPayload) {
			registry.heartbeat(wsId);
			send(socket, { op: WsOp.HEARTBEAT_ACK, payload: { timestamp: payload.timestamp } });
		}

		function handleShardStatus(payload: ShardStatusPayload) {
			registry.updateStatus(wsId, payload.status);
			if (payload.status !== 'ready') return;

			const info = registry.getProcess(wsId);
			if (info) notifier.shardReady(wsId, info.shardIds, info.hostname);
		}
	});
}
