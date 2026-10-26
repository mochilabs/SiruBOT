import { LavalinkNode, NodeManager } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { RESUME_TIMEOUT_SECONDS, SessionRestoreEngine } from './sessionRestore.ts';
import { reportNodeEvent } from '../../../../services/playbackReporter.ts';
import type { CustomPlayer } from '../player/customPlayer.ts';
import {
	handleMixerNeedNext,
	handleMixerAdvanced,
	handleMixerOverridden,
	type MixerNeedNextEventPayload,
	type MixerAdvancedEventPayload,
	type MixerOverriddenEventPayload
} from './mixerHandlers.ts';
/**
 * lavalink 노드 이벤트 핸들러 — 세션 저장/복원 엔진(SessionRestoreEngine)과
 * 노드 수명주기 로깅·고아 플레이어 마이그레이션만 담당한다.
 */
export class NodeHandler extends BaseLavalinkHandler {
	/** 세션 저장·복원 엔진 — ready/resumed 위임과 크래시 복구 전체를 담는다. */
	public readonly sessionRestore: SessionRestoreEngine;

	constructor(private readonly nodeManager: NodeManager) {
		super('nodeHandler');
		this.sessionRestore = new SessionRestoreEngine(this.logger);

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
		// ready op는 'resumed' 이벤트와 무관하게 항상 온다 — sessionId 확정 저장과
		// fresh 세션 복구(크래시 재시작)의 트리거로 사용한다.
		this.nodeManager.on('raw', this.handleNodeRaw.bind(this));
	}

	private handleNodeCreate(node: LavalinkNode) {
		this.logger.info(`Node created: ${node.options.id}`);
	}

	private async handleNodeConnect(node: LavalinkNode) {
		this.logger.info(`Node connected: ${node.options.id}`);
		try {
			// Enable resuming (timeout is in seconds per Lavalink API).
			// 첫 연결(sessionId 미확정)이나 이전 세션 만료(404)면 건너뛴다 — ready op가 새 세션을 확정한다.
			if (node.sessionId) {
				await node.updateSession(true, RESUME_TIMEOUT_SECONDS);
			}
		} catch (error) {
			this.logger.debug(`updateSession skipped for node ${node.options.id}: ${error}`);
		}
		await this.sessionRestore.saveNodeSession(node);
	}

	/**
	 * raw payload 중 ready op와 mixer op를 이벤트 측에서 분류한다.
	 * - mixer op: overlapEnd(aborted)만 MixerService에 기록한다(나머지는 무시).
	 * - ready op: sessionId 확정 저장·resume 연장·fresh 복구는 엔진(handleReadyOp)이 위임한다.
	 */
	private handleNodeRaw(node: LavalinkNode, payload: unknown) {
		const data = payload as { op?: unknown; resumed?: unknown } | null;
		if (!data) return;
		// v2 mixer custom WebSocket events
		if (data.op === 'mixer') {
			const mixerMsg = payload as { type?: string; guildId?: string };
			const gid = mixerMsg.guildId;
			if (!gid) return;
			this.container.mixerService?.observeMixerEvent?.(payload);
			const player = this.container.audio?.getPlayer?.(gid) as CustomPlayer | null;
			if (!player) return;

			if (mixerMsg.type === 'MixerNeedNextTrackEvent') {
				void handleMixerNeedNext(player, payload as unknown as MixerNeedNextEventPayload);
			} else if (mixerMsg.type === 'MixerAdvancedEvent') {
				void handleMixerAdvanced(player, payload as unknown as MixerAdvancedEventPayload);
			} else if (mixerMsg.type === 'MixerOverriddenEvent') {
				handleMixerOverridden(player, payload as unknown as MixerOverriddenEventPayload);
			}
			return;
		}
		if (data.op !== 'ready') return;
		this.sessionRestore.handleReadyOp(node, data.resumed === false);
	}

	private handleNodeDisconnect(node: LavalinkNode, reason: { code?: number | undefined; reason?: string | undefined }) {
		this.logger.info(`Node disconnected: ${node.options.id} | ${reason.reason}`);
		reportNodeEvent(node.id, 'node_disconnect', reason.reason ?? (reason.code != null ? `code ${reason.code}` : null));
		const orphanPlayers = this.container.audio.players
			.filter((player) => player.node.id === node.options.id)
			.values()
			.toArray();

		const leastUsedNode = this.container.audio.nodeManager.leastUsedNodes('playingPlayers');

		if (leastUsedNode.length === 0) {
			this.logger.warn(`Node disconnected: ${node.options.id} | no available nodes to move ${orphanPlayers.length} orphan players`);
			return;
		}

		// Move orphan players to least used nodes with simple cycling
		for (let idx = 0; idx < orphanPlayers.length; idx++) {
			// Simple cycling through available nodes
			// changeNode 실패(레이스로 신노드에 플레이어 미존재 등)를 두면 unhandled rejection + 오펜 플레이어가 남는다.
			const player = orphanPlayers[idx];
			this.container.mixerService?.markFiltersStale?.(player.guildId);
			player
				.changeNode(leastUsedNode[idx % leastUsedNode.length])
				.then(async () => {
					// 마이그레이션한 신노드의 플러그인은 필터·설정·슬롯 상태를 모른다 —
					// 필터와 DB 설정을 재전송하고 에폭을 맞추기 위해 리셋한다 (B-10).
					await Promise.resolve(this.container.mixerService?.ensureMixerFilter?.(player)).catch(() => null);
					const reset = this.container.mixerService?.reset?.(player as CustomPlayer, (player as CustomPlayer).currentEpoch ?? 1);
					return Promise.resolve(reset).catch(() => null);
				})
				.catch((error) => this.logger.warn(`Node migration failed at guild ${player.guildId}: ${error}`));
		}
	}

	private handleNodeReconnecting(node: LavalinkNode) {
		this.logger.info(`Node reconnecting: ${node.options.id}`);
		// Lavalink 재시작 뒤 플러그인 필터 상태가 사라질 수 있다. 예열 슬롯은
		// session resume 시 여전히 유효할 수 있으므로 보존하고, 다음 play 이전에만 필터를 재적용한다.
		this.container.mixerService.resetFilterReadiness();
	}

	private handleNodeDestroy(node: LavalinkNode) {
		this.logger.info(`Node destroyed: ${node.options.id}`);
	}

	private handleNodeError(node: LavalinkNode, error: Error, payload: unknown) {
		// lavalink-client가 mixer op를 몰라 던지는 오류 — raw에서 이미 소비하므로 error로 안 올린다.
		if (error.message.startsWith('Unexpected op "mixer"')) {
			this.logger.debug(`Node ${node.options.id} reported a mixer op: ${JSON.stringify(payload)}`);
			return;
		}
		this.logger.error(`Node error: ${node.options.id}`, error, payload);
		reportNodeEvent(node.id, 'node_error', error.message);
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
