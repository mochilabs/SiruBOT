import { InvalidLavalinkRestRequest, LavalinkNode, LavalinkPlayer, NodeManager } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';

export class NodeHandler extends BaseLavalinkHandler {
	constructor(private readonly nodeManager: NodeManager) {
		super('nodeHandler');

		this.nodeManager.on('create', this.handleNodeCreate.bind(this));
		this.nodeManager.on('connect', this.handleNodeConnect.bind(this));
		this.nodeManager.on('disconnect', this.handleNodeDisconnect.bind(this));
		this.nodeManager.on('reconnecting', this.handleNodeReconnecting.bind(this));
		this.nodeManager.on('destroy', this.handleNodeDestroy.bind(this));
		this.nodeManager.on('error', this.handleNodeError.bind(this));
		this.nodeManager.on('resumed', this.wrapAsyncHandler(this.handleNodeResumed.bind(this), 'handleNodeResumed'));
	}

	private handleNodeCreate(node: LavalinkNode) {
		this.logger.info(`Node created: ${node.options.id}`);
	}

	private handleNodeConnect(node: LavalinkNode) {
		this.logger.info(`Node connected: ${node.options.id}`);
		// Enable resuming for 5 minutes
		node.updateSession(true, 1000 * 60 * 5);
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
		this.logger.debug(`Resuming players on node (${node.options.id}) session id (${payload.sessionId}) with ${players.length} players`);
		const startTime = Date.now();
		const playerSaver = this.container.redisStore.getPlayerSaver();
		for (const lavalinkPlayer of players) {
			if (!lavalinkPlayer.state.connected) {
				this.logger.debug(`Player at ${lavalinkPlayer.guildId} is already disconnected`);

				await playerSaver.delete(lavalinkPlayer.guildId);
				continue;
			}

			// 현재 샤드가 담당하지 않는 길드는 건너뛰기
			if (!this.container.client.guilds.cache.has(lavalinkPlayer.guildId)) {
				this.logger.debug(`Skipping resume for guild ${lavalinkPlayer.guildId} (not in this shard's cache)`);
				continue;
			}

			const savedPlayer = await playerSaver.get(lavalinkPlayer.guildId);
			if (!savedPlayer) {
				this.logger.debug(`Saved player at ${lavalinkPlayer.guildId} is not found`);
				continue;
			}

			// Create player from saved player data
			const createdPlayer = await this.container.audio.createPlayer({
				guildId: lavalinkPlayer.guildId,
				voiceChannelId: savedPlayer.voiceChannelId,
				textChannelId: savedPlayer.textChannelId,
				selfDeaf: savedPlayer.options.selfDeaf,
				selfMute: savedPlayer.options.selfMute,

				volume: this.container.audio.options.playerOptions?.volumeDecrementer
					? Math.round(lavalinkPlayer.volume / this.container.audio.options.playerOptions.volumeDecrementer)
					: lavalinkPlayer.volume,

				applyVolumeAsFilter: savedPlayer.options.applyVolumeAsFilter,
				instaUpdateFiltersFix: savedPlayer.options.instaUpdateFiltersFix,
				vcRegion: savedPlayer.options.vcRegion
			});

			if (savedPlayer.textChannelId && savedPlayer.messageId) {
				this.logger.debug(`Setting cached controller message and message id for player at ${lavalinkPlayer.guildId}`);
				const fetchedChannel = await this.container.client.channels.fetch(savedPlayer.textChannelId).catch(() => null);
				if (fetchedChannel && fetchedChannel.isTextBased()) {
					const message = await fetchedChannel.messages.fetch(savedPlayer.messageId).catch(() => null);
					this.logger.debug(`Fetched controller message for player at ${lavalinkPlayer.guildId}`);
					if (message?.editable) {
						createdPlayer.messageId = message.id;
						createdPlayer.controller = message;
					}
				}
			}

			// Reconnect player
			await createdPlayer.connect();
			// Set filters
			createdPlayer.filterManager.data = savedPlayer.filters;
			// Sync queue
			await createdPlayer.queue.utils.sync(true, false).catch(this.logger.error.bind(this));

			// Override player current track
			if (lavalinkPlayer.track)
				createdPlayer.queue.current = this.container.audio.utils.buildTrack(
					lavalinkPlayer.track,
					createdPlayer.queue.current?.requester || this.container.client.user
				);

			const now = Date.now();
			createdPlayer.lastPosition = lavalinkPlayer.state.position + (now - startTime);
			createdPlayer.lastPositionChange = now;
			createdPlayer.ping.lavalink = lavalinkPlayer.state.ping;

			// Set player paused / playing state
			createdPlayer.paused = lavalinkPlayer.paused;
			createdPlayer.playing = !lavalinkPlayer.paused && !!lavalinkPlayer.track;

			this.logger.debug(`Finished resuming player at ${lavalinkPlayer.guildId}`);
		}
	}

	private handleNodeDisconnect(node: LavalinkNode, reason: { code?: number | undefined; reason?: string | undefined }) {
		this.logger.info(`Node disconnected: ${node.options.id} | ${reason.reason}`);
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
		this.logger.info(`Node reconnecting: ${node.options.id}`);
	}

	private handleNodeDestroy(node: LavalinkNode) {
		this.logger.info(`Node destroyed: ${node.options.id}`);
	}

	//@ts-ignore
	private handleNodeError(node: LavalinkNode, error: Error, payload: any) {
		this.logger.error(`Node error: ${node.options.id}`, error, payload);
	}

	public cleanup(): void {
		this.logger.info('Cleanup lavalink nodeHandler');
		this.nodeManager?.removeAllListeners('create');
		this.nodeManager?.removeAllListeners('connect');
		this.nodeManager?.removeAllListeners('disconnect');
		this.nodeManager?.removeAllListeners('reconnecting');
		this.nodeManager?.removeAllListeners('destroy');
		this.nodeManager?.removeAllListeners('error');
		this.nodeManager?.removeAllListeners('resumed');
	}
}
