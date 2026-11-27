import { LavalinkNode, NodeManager } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { RESUME_TIMEOUT_SECONDS, SessionRestoreEngine } from './sessionRestore.ts';
import * as Sentry from '@sentry/node';
import type { CustomPlayer } from '../player/customPlayer.ts';
import type { LavalinkDeps } from '../deps.ts';
import {
	handleMixerNeedNext,
	handleMixerAdvanced,
	handleMixerOverridden,
	type MixerNeedNextEventPayload,
	type MixerAdvancedEventPayload,
	type MixerOverriddenEventPayload
} from './mixerHandlers.ts';
export const MIXER_IDLE_CARRIER_ID = 'lavalink-mixer:idle-carrier';

interface IdleCarrierPayload {
	type: string;
	track?: { info?: { identifier?: string } };
}

const TRACK_EVENT_TYPES = new Set(['TrackStartEvent', 'TrackEndEvent', 'TrackStuckEvent', 'TrackExceptionEvent']);

/** Drop internal idle-carrier track events before lavalink-client treats them as real playback. */
export function guardIdleCarrierEvents(node: LavalinkNode): void {
	const target = node as unknown as { handleEvent: (payload: IdleCarrierPayload) => Promise<void> };
	const original = target.handleEvent.bind(node);
	target.handleEvent = (payload) => {
		if (TRACK_EVENT_TYPES.has(payload.type) && payload.track?.info?.identifier === MIXER_IDLE_CARRIER_ID) return Promise.resolve();
		return original(payload);
	};
}

export class NodeHandler extends BaseLavalinkHandler {
	public readonly sessionRestore: SessionRestoreEngine;

	constructor(
		deps: LavalinkDeps,
		private readonly nodeManager: NodeManager
	) {
		super(deps, 'nodeHandler');
		this.sessionRestore = new SessionRestoreEngine(this.deps, this.logger);

		this.nodeManager.on('create', this.handleNodeCreate.bind(this));
		this.nodeManager.on('connect', this.wrapAsyncHandler(this.handleNodeConnect.bind(this), 'handleNodeConnect'));
		this.nodeManager.on('disconnect', this.handleNodeDisconnect.bind(this));
		this.nodeManager.on('reconnecting', this.handleNodeReconnecting.bind(this));
		this.nodeManager.on('destroy', this.handleNodeDestroy.bind(this));
		this.nodeManager.on('error', this.handleNodeError.bind(this));
		this.nodeManager.on(
			'resumed',
			this.wrapAsyncHandler(this.sessionRestore.handleResumedPlayers.bind(this.sessionRestore), 'handleNodeResumed')
		);
		this.nodeManager.on('raw', this.handleNodeRaw.bind(this));
	}

	private handleNodeCreate(node: LavalinkNode) {
		this.logger.info(`Node created: ${node.options.id}`);
		guardIdleCarrierEvents(node);
	}

	private async handleNodeConnect(node: LavalinkNode) {
		this.logger.info(`Node connected: ${node.options.id}`);
		try {
			if (node.sessionId) {
				await node.updateSession(true, RESUME_TIMEOUT_SECONDS);
			}
		} catch (error) {
			this.logger.debug(`updateSession skipped for node ${node.options.id}: ${error}`);
		}
		await this.sessionRestore.saveNodeSession(node);
	}

	private handleNodeRaw(node: LavalinkNode, payload: unknown) {
		const data = payload as { op?: unknown; resumed?: unknown } | null;
		if (!data) return;
		if (data.op === 'mixer') {
			const mixerMsg = payload as { type?: string; guildId?: string };
			const gid = mixerMsg.guildId;
			if (!gid) return;
			this.deps.mixerService?.observeMixerEvent?.(payload);
			const player = this.deps.audio?.getPlayer?.(gid) as CustomPlayer | null;
			if (!player) return;

			if (mixerMsg.type === 'MixerNeedNextTrackEvent') {
				void handleMixerNeedNext(this.deps, player, payload as unknown as MixerNeedNextEventPayload);
			} else if (mixerMsg.type === 'MixerAdvancedEvent') {
				void handleMixerAdvanced(this.deps, player, payload as unknown as MixerAdvancedEventPayload);
			} else if (mixerMsg.type === 'MixerOverriddenEvent') {
				handleMixerOverridden(this.deps, player, payload as unknown as MixerOverriddenEventPayload);
			}
			return;
		}
		if (data.op !== 'ready') return;
		this.sessionRestore.handleReadyOp(node, data.resumed === false);
	}

	private handleNodeDisconnect(node: LavalinkNode, reason: { code?: number | undefined; reason?: string | undefined }) {
		this.logger.info(`Node disconnected: ${node.options.id} | ${reason.reason}`);
		this.deps.playbackReporter.reportNodeEvent(node.id, 'node_disconnect', reason.reason ?? (reason.code != null ? `code ${reason.code}` : null));
		const orphanPlayers = this.deps.audio.players
			.filter((player) => player.node.id === node.options.id)
			.values()
			.toArray();
		this.sessionRestore.markOrphanPlayers(orphanPlayers);

		const leastUsedNode = this.deps.audio.nodeManager.leastUsedNodes('playingPlayers');

		if (leastUsedNode.length === 0) {
			this.logger.warn(`Node disconnected: ${node.options.id} | no available nodes to move ${orphanPlayers.length} orphan players`);
			return;
		}

		for (let idx = 0; idx < orphanPlayers.length; idx++) {
			const player = orphanPlayers[idx];
			const hadMixer = this.deps.mixerService?.hasMixerFilter?.(player) ?? false;
			this.deps.mixerService?.markFiltersStale?.(player.guildId);
			player
				.changeNode(leastUsedNode[idx % leastUsedNode.length])
				.then(async () => {
					this.sessionRestore.clearOrphanPlayer(player);
					// changeNode sends the track before filters, so rebuild the mixer chain on the new node.
					const resync = hadMixer
						? this.deps.mixerService?.rebuildMixerChain?.(player)
						: this.deps.mixerService?.ensureMixerFilter?.(player);
					await Promise.resolve(resync).catch((error) =>
						this.logger.warn(`Mixer filter resync after node migration failed at guild ${player.guildId}: ${error}`)
					);
					const reset = this.deps.mixerService?.reset?.(player as CustomPlayer, (player as CustomPlayer).currentEpoch ?? 1);
					return Promise.resolve(reset).catch(() => null);
				})
				.catch((error) => this.logger.warn(`Node migration failed at guild ${player.guildId}: ${error}`));
		}
	}

	private handleNodeReconnecting(node: LavalinkNode) {
		this.logger.info(`Node reconnecting: ${node.options.id}`);
		this.deps.mixerService.resetFilterReadiness();
	}

	private handleNodeDestroy(node: LavalinkNode) {
		this.logger.info(`Node destroyed: ${node.options.id}`);
	}

	private handleNodeError(node: LavalinkNode, error: Error, payload: unknown) {
		if (error.message.startsWith('Unexpected op "mixer"')) {
			this.logger.debug(`Node ${node.options.id} reported a mixer op: ${JSON.stringify(payload)}`);
			return;
		}
		this.logger.error(`Node error: ${node.options.id}`, error, payload);
		this.deps.playbackReporter.reportNodeEvent(node.id, 'node_error', error.message);

		Sentry.withScope((scope) => {
			scope.setTag('type', 'lavalinkNodeError');
			scope.setTag('lavalink_node', node.options.id);
			Sentry.captureException(error);
		});
	}

	public cleanup(): void {
		this.logger.info('Cleanup lavalink nodeHandler');
		this.sessionRestore.clearTimers();
		this.nodeManager?.removeAllListeners('create');
		this.nodeManager?.removeAllListeners('connect');
		this.nodeManager?.removeAllListeners('disconnect');
		this.nodeManager?.removeAllListeners('reconnecting');
		this.nodeManager?.removeAllListeners('destroy');
		this.nodeManager?.removeAllListeners('error');
		this.nodeManager?.removeAllListeners('resumed');
		this.nodeManager?.removeAllListeners('raw');
	}
}
