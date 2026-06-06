import { InvalidLavalinkRestRequest, LavalinkNode, LavalinkPlayer, NodeManager } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { NodeSessionStore } from '../redisStore.ts';

export class NodeHandler extends BaseLavalinkHandler {
	constructor(private readonly nodeManager: NodeManager) {
		super('nodeHandler');

		this.nodeManager.on('create', this.handleNodeCreate.bind(this));
		this.nodeManager.on('connect', this.wrapAsyncHandler(this.handleNodeConnect.bind(this), 'handleNodeConnect'));
		this.nodeManager.on('disconnect', this.handleNodeDisconnect.bind(this));
		this.nodeManager.on('reconnecting', this.handleNodeReconnecting.bind(this));
		this.nodeManager.on('destroy', this.handleNodeDestroy.bind(this));
		this.nodeManager.on('error', this.handleNodeError.bind(this));
		this.nodeManager.on('resumed', this.wrapAsyncHandler(this.handleNodeResumed.bind(this), 'handleNodeResumed'));
	}

	private handleNodeCreate(node: LavalinkNode) {
		this.logger.info('audio.node.created', { node_id: node.options.id });
	}

	private async handleNodeConnect(node: LavalinkNode) {
		this.logger.info('audio.node.connected', { node_id: node.options.id });
		// Enable resuming for 5 minutes (timeout is in seconds per Lavalink API)
		await node.updateSession(true, 60 * 5);

		// 연결 시 sessionId를 Redis에 저장
		if (node.sessionId && this.container.shardInfo) {
			const shardKey = NodeSessionStore.makeShardKey(this.container.shardInfo.shardIds);
			await this.container.redisStore.getNodeSessionStore().save(node.id, node.sessionId, shardKey);
		}
	}

	private async handleNodeResumed(
		node: LavalinkNode,
		payload: {
			resumed: true;
			sessionId: string;
			op: 'ready';
		},
		players: LavalinkPlayer[] | InvalidLavalinkRestRequest
	) {
		if (!Array.isArray(players)) {
			throw new Error('Resume players is not an array');
		}
		this.logger.debug('audio.node.resuming_players', { node_id: node.options.id, session_id: payload.sessionId, count: players.length });
		const startTime = Date.now();
		const playerSaver = this.container.redisStore.getPlayerSaver();

		// 5분 이상 경과한 플레이어는 stale로 간주하여 스킵
		const STALE_THRESHOLD_MS = 5 * 60 * 1000;
		const BATCH_SIZE = 10;

		// 유효한 플레이어만 필터링
		const validPlayers = players.filter((lavalinkPlayer) => {
			if (!lavalinkPlayer.state.connected) {
				this.logger.debug('audio.node.player_already_disconnected', { guild_id: lavalinkPlayer.guildId });
				playerSaver.delete(lavalinkPlayer.guildId);
				return false;
			}

			if (!this.container.client.guilds.cache.has(lavalinkPlayer.guildId)) {
				this.logger.debug('audio.node.skip_resume_not_in_shard', { guild_id: lavalinkPlayer.guildId });
				return false;
			}

			// 마지막 상태 업데이트가 너무 오래됐으면 버리기
			if (lavalinkPlayer.state.time && startTime - lavalinkPlayer.state.time > STALE_THRESHOLD_MS) {
				this.logger.debug('audio.node.skip_stale_player', { 
                    guild_id: lavalinkPlayer.guildId, 
                    seconds_ago: Math.round((startTime - lavalinkPlayer.state.time) / 1000) 
                });
				playerSaver.delete(lavalinkPlayer.guildId);
				return false;
			}

			return true;
		});

		this.logger.debug('audio.node.resume_filtered', { original: players.length, valid: validPlayers.length });

		// 배치 단위 병렬 처리
		for (let i = 0; i < validPlayers.length; i += BATCH_SIZE) {
			const batch = validPlayers.slice(i, i + BATCH_SIZE);
			const results = await Promise.allSettled(
				batch.map((lavalinkPlayer) => this.resumeSinglePlayer(node, lavalinkPlayer, playerSaver, startTime))
			);

			for (const result of results) {
				if (result.status === 'rejected') {
					this.logger.error('audio.node.resume_failed', { error: result.reason });
				}
			}
		}

		this.logger.info('audio.node.resume_completed', { duration_ms: Date.now() - startTime, count: validPlayers.length });
	}

	private async resumeSinglePlayer(
		node: LavalinkNode,
		lavalinkPlayer: LavalinkPlayer,
		playerSaver: ReturnType<typeof this.container.redisStore.getPlayerSaver>,
		startTime: number
	) {
		const savedPlayer = await playerSaver.get(lavalinkPlayer.guildId);
		if (!savedPlayer) {
			this.logger.debug('audio.node.saved_player_not_found', { guild_id: lavalinkPlayer.guildId });
			return;
		}

		const createdPlayer = await this.container.audio.createPlayer({
			guildId: lavalinkPlayer.guildId,
			voiceChannelId: savedPlayer.voiceChannelId,
			textChannelId: savedPlayer.textChannelId,
			selfDeaf: savedPlayer.options.selfDeaf,
			selfMute: savedPlayer.options.selfMute,

			node: node.id,
			volume: this.container.audio.options.playerOptions?.volumeDecrementer
				? Math.round(lavalinkPlayer.volume / this.container.audio.options.playerOptions.volumeDecrementer)
				: lavalinkPlayer.volume,

			applyVolumeAsFilter: savedPlayer.options.applyVolumeAsFilter,
			instaUpdateFiltersFix: savedPlayer.options.instaUpdateFiltersFix,
			vcRegion: savedPlayer.options.vcRegion
		});

		if (savedPlayer.textChannelId && savedPlayer.messageId) {
			this.logger.debug('audio.node.setting_cached_controller', { guild_id: lavalinkPlayer.guildId });
			const fetchedChannel = await this.container.client.channels.fetch(savedPlayer.textChannelId).catch(() => null);
			if (fetchedChannel && fetchedChannel.isTextBased()) {
				const message = await fetchedChannel.messages.fetch(savedPlayer.messageId).catch(() => null);
				this.logger.debug('audio.node.fetched_controller_message', { guild_id: lavalinkPlayer.guildId });
				if (message?.editable) {
					createdPlayer.messageId = message.id;
					createdPlayer.controller = message;
				}
			}
		}

		await createdPlayer.connect();
		createdPlayer.filterManager.data = savedPlayer.filters;
		await createdPlayer.queue.utils.sync(true, false).catch((err) => this.logger.error('audio.node.sync_failed', { error: err }));

		if (lavalinkPlayer.track)
			createdPlayer.queue.current = this.container.audio.utils.buildTrack(
				lavalinkPlayer.track,
				createdPlayer.queue.current?.requester || this.container.client.user
			);

		const now = Date.now();
		createdPlayer.lastPosition = lavalinkPlayer.state.position + (now - startTime);
		createdPlayer.lastPositionChange = now;
		createdPlayer.ping.lavalink = lavalinkPlayer.state.ping;

		createdPlayer.paused = lavalinkPlayer.paused;
		createdPlayer.playing = !lavalinkPlayer.paused && !!lavalinkPlayer.track;

		this.logger.debug('audio.node.finished_resuming', { guild_id: lavalinkPlayer.guildId });
	}

	private handleNodeDisconnect(node: LavalinkNode, reason: { code?: number | undefined; reason?: string | undefined }) {
		this.logger.warn('audio.node.disconnected', { node_id: node.options.id, reason: reason.reason });
		const orphanPlayers = this.container.audio.players
			.filter((player) => player.node.id === node.options.id)
			.values()
			.toArray();

		const leastUsedNode = this.container.audio.nodeManager.leastUsedNodes('playingPlayers');

		// Move orphan players to least used nodes with simple cycling
		for (let idx = 0; idx < orphanPlayers.length; idx++) {
			// Simple cycling through available nodes
			orphanPlayers[idx].changeNode(leastUsedNode[idx % leastUsedNode.length]);
		}
	}

	private handleNodeReconnecting(node: LavalinkNode) {
		this.logger.warn('audio.node.reconnecting', { node_id: node.options.id });
	}

	private handleNodeDestroy(node: LavalinkNode) {
		this.logger.info('audio.node.destroyed', { node_id: node.options.id });
	}

	private handleNodeError(node: LavalinkNode, error: Error, payload: unknown) {
		this.logger.error('audio.node.error', { node_id: node.options.id, error, payload });
	}

	public cleanup(): void {
		this.logger.info('audio.node.cleanup', {});
		this.nodeManager?.removeAllListeners('create');
		this.nodeManager?.removeAllListeners('connect');
		this.nodeManager?.removeAllListeners('disconnect');
		this.nodeManager?.removeAllListeners('reconnecting');
		this.nodeManager?.removeAllListeners('destroy');
		this.nodeManager?.removeAllListeners('error');
		this.nodeManager?.removeAllListeners('resumed');
	}
}
