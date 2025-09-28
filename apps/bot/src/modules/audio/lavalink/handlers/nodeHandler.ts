import { InvalidLavalinkRestRequest, LavalinkNode, LavalinkPlayer, NodeManager } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { TextChannel } from 'discord.js';

// TODO: 안쓰는거 정리, ts-ignore 제거
export class NodeHandler extends BaseLavalinkHandler {
	private nodeManager: NodeManager | null;
	constructor() {
		super();
		this.nodeManager = null;
	}

	public setup(nodeManager: NodeManager): void {
		this.logger.info('Setup lavalink nodeHandler');
		this.nodeManager = nodeManager;

		nodeManager.on('create', this.handleNodeCreate.bind(this));
		nodeManager.on('connect', this.handleNodeConnect.bind(this));
		nodeManager.on('disconnect', this.handleNodeDisconnect.bind(this));
		nodeManager.on('reconnecting', this.handleNodeReconnecting.bind(this));
		nodeManager.on('destroy', this.handleNodeDestroy.bind(this));
		nodeManager.on('error', this.handleNodeError.bind(this));
		nodeManager.on('resumed', this.wrapAsyncHandler(this.handleNodeResumed.bind(this), 'handleNodeResumed'));
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

		const playerSaver = this.container.redisStoreManager.getPlayerSaver();
		for (const lavalinkPlayer of players) {
			if (!lavalinkPlayer.state.connected) {
				this.logger.debug(`Player at ${lavalinkPlayer.guildId} is already disconnected`);

				playerSaver.delete(lavalinkPlayer.guildId);
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
			createdPlayer.lastPosition = lavalinkPlayer.state.position;
			createdPlayer.lastPositionChange = now;
			createdPlayer.ping.lavalink = lavalinkPlayer.state.ping;

			// Set player paused / playing state
			createdPlayer.paused = lavalinkPlayer.paused;
			createdPlayer.playing = !lavalinkPlayer.paused && !!lavalinkPlayer.track;

			this.logger.debug(`Finished resuming player at ${lavalinkPlayer.guildId}`);

			// TODO: For debugging
			if (createdPlayer.textChannelId) {
				const textChannel = this.container.client.channels.cache.get(createdPlayer.textChannelId) as TextChannel;
				if (textChannel && textChannel.isTextBased()) {
					textChannel.send({ content: `Player at ${lavalinkPlayer.guildId} resumed` });
				}
			}
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
		this.logger.info(`Node error: ${node.options.id}`);
	}

	public cleanup(): void {
		this.logger.info('Cleanup lavalink nodeHandler');
		this.nodeManager?.off('create', this.handleNodeCreate.bind(this));
		this.nodeManager?.off('connect', this.handleNodeConnect.bind(this));
		this.nodeManager?.off('disconnect', this.handleNodeDisconnect.bind(this));
		this.nodeManager?.off('reconnecting', this.handleNodeReconnecting.bind(this));
		this.nodeManager?.off('destroy', this.handleNodeDestroy.bind(this));
		this.nodeManager?.off('error', this.handleNodeError.bind(this));
		this.nodeManager?.off('resumed', this.handleNodeResumed.bind(this));
	}
}
