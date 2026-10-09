import { InvalidLavalinkRestRequest, LavalinkNode, LavalinkPlayer, NodeManager } from 'lavalink-client';
import { ChannelType } from 'discord.js';
import { BaseLavalinkHandler } from './base.ts';
import { NodeSessionStore } from '../redisStore.ts';
import { CustomPlayer } from '../player/customPlayer.ts';
import { CachedPlayerSaver } from '../player/playerSaver.ts';

/** playerSaver.get() 반환 — 재시작 복구의 입력이 되는 저장 플레이어 형태. */
type SavedPlayer = NonNullable<Awaited<ReturnType<CachedPlayerSaver['get']>>>;

/** fresh 세션 복구 한도 — 이보다 오래된 잔재는 복구하지 않고 정리한다. */
const FRESH_RESTORE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** 길드가 캐시에 도착할 때까지 기다리는 시간(대형 봇은 READY 뒤에도 GUILD_CREATE가 스트리밍된다). */
const GUILD_WAIT_TIMEOUT_MS = 90_000;
const GUILD_WAIT_POLL_MS = 3_000;
/** resume 대상 플레이어의 마지막 상태 갱신이 이보다 오래됐으면 stale로 간주한다. */
const RESUME_STALE_THRESHOLD_MS = 5 * 60 * 1000;
/** 복구 동시성 — Discord 음성 연결/REST에 과부하를 주지 않도록 제한한다. */
const RESTORE_BATCH_SIZE = 10;

export class NodeHandler extends BaseLavalinkHandler {
	/** 복구 대기/재시도 타이머 — cleanup 시 일괄 해제한다. */
	private readonly restoreTimers = new Set<NodeJS.Timeout>();

	constructor(private readonly nodeManager: NodeManager) {
		super('nodeHandler');

		this.nodeManager.on('create', this.handleNodeCreate.bind(this));
		this.nodeManager.on('connect', this.wrapAsyncHandler(this.handleNodeConnect.bind(this), 'handleNodeConnect'));
		this.nodeManager.on('disconnect', this.handleNodeDisconnect.bind(this));
		this.nodeManager.on('reconnecting', this.handleNodeReconnecting.bind(this));
		this.nodeManager.on('destroy', this.handleNodeDestroy.bind(this));
		this.nodeManager.on('error', this.handleNodeError.bind(this));
		this.nodeManager.on('resumed', this.wrapAsyncHandler(this.handleNodeResumed.bind(this), 'handleNodeResumed'));
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
			// Enable resuming for 5 minutes (timeout is in seconds per Lavalink API).
			// 첫 연결(sessionId 미확정)이나 이전 세션 만료(404)면 건너뛴다 — ready op가 새 세션을 확정한다.
			if (node.sessionId) {
				await node.updateSession(true, 60 * 5);
			}
		} catch (error) {
			this.logger.debug(`updateSession skipped for node ${node.options.id}: ${error}`);
		}
		await this.saveNodeSession(node);
	}

	/** ready op 도착 시점의 sessionId는 확정값 — 크래시 재시작 후 세션 복구가 가능하도록 저장한다. */
	private async saveNodeSession(node: LavalinkNode): Promise<void> {
		if (!node.sessionId || !this.container.shardInfo) return;
		try {
			const shardKey = NodeSessionStore.makeShardKey(this.container.shardInfo.shardIds);
			await this.container.redisStore.getNodeSessionStore().save(node.id, node.sessionId, shardKey);
		} catch (error) {
			this.logger.warn(`Failed to save session for node ${node.id}: ${error}`);
		}
	}

	/**
	 * 모든 raw payload 중 ready op만 처리한다.
	 * - resumed=true: sessionId 확정 저장(이미 'resumed' 핸들러가 복구를 담당).
	 * - resumed=false: 이전 세션을 못 썼다는 뜻 — 서버에 플레이어가 없으므로
	 *   Redis의 플레이어/큐 기록에서 재구성한다(크래시 재시작 포함).
	 */
	private handleNodeRaw(node: LavalinkNode, payload: unknown) {
		const data = payload as { op?: unknown; resumed?: unknown } | null;
		if (!data || data.op !== 'ready') return;
		// 'raw'는 라이브러리가 payload.sessionId을 node.sessionId에 대입하기 '전'에 발화한다
		// (lavalink-client: emit('raw') → switch → sessionId assign). 새 세션 id를 보려면
		// 다음 턴으로 넘겨야 한다 — 여기서 읽으면 이전 세션 id(또는 null)를 읽는다.
		const timer = setTimeout(() => {
			this.restoreTimers.delete(timer);
			void this.saveNodeSession(node);
			// ready 직후에도 세션 유지(resume)를 다시 연장한다 — 5분 타이머가 걸려 있어야
			// 그 안에 재시작됐을 때 서버 플레이어가 그대로 이어진다.
			if (node.sessionId) void node.updateSession(true, 60 * 5).catch(() => null);
			if (data.resumed === false) {
				this.logger.info(`Node ${node.options.id} started a fresh session: restoring players from store`);
				void this.restoreFreshSession(node).catch((error) => this.logger.error(`Fresh session restore failed: ${error}`));
			}
		}, 0);
		this.restoreTimers.add(timer);
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
		const BATCH_SIZE = RESTORE_BATCH_SIZE;

		// 유효한 플레이어만 필터링
		const validPlayers: LavalinkPlayer[] = [];
		const pendingGuildPlayers: LavalinkPlayer[] = [];
		players.forEach((lavalinkPlayer) => {
			if (!lavalinkPlayer.state.connected) {
				this.logger.debug(`Player at ${lavalinkPlayer.guildId} is already disconnected`);
				playerSaver.delete(lavalinkPlayer.guildId);
				return;
			}

			if (!this.container.client.guilds.cache.has(lavalinkPlayer.guildId)) {
				// READY 직후에는 대형 봇의 GUILD_CREATE가 아직 스트리밍 중일 수 있다 —
				// 길드가 캐시에 오기를 기다렸다가 복구한다(즉시 버리지 않는다).
				pendingGuildPlayers.push(lavalinkPlayer);
				return;
			}

			// 마지막 상태 업데이트가 너무 오래됐으면 버리기
			if (lavalinkPlayer.state.time && startTime - lavalinkPlayer.state.time > RESUME_STALE_THRESHOLD_MS) {
				this.logger.debug(
					`Skipping stale player at ${lavalinkPlayer.guildId} (last update: ${Math.round((startTime - lavalinkPlayer.state.time) / 1000)}s ago)`
				);
				playerSaver.delete(lavalinkPlayer.guildId);
				return;
			}

			validPlayers.push(lavalinkPlayer);
		});

		this.logger.debug(
			`Filtered ${players.length} -> ${validPlayers.length} valid + ${pendingGuildPlayers.length} pending (guild cache) players for resume`
		);

		// 배치 단위 병렬 처리
		for (let i = 0; i < validPlayers.length; i += BATCH_SIZE) {
			const batch = validPlayers.slice(i, i + BATCH_SIZE);
			const results = await Promise.allSettled(
				batch.map((lavalinkPlayer) => this.resumeSinglePlayer(node, lavalinkPlayer, playerSaver, startTime))
			);

			for (const result of results) {
				if (result.status === 'rejected') {
					this.logger.error(`Failed to resume a player:`, result.reason);
				}
			}
		}

		// 길드 캐시를 기다리던 플레이어는 폴링 재시도로 이어받는다.
		for (const pending of pendingGuildPlayers) {
			this.scheduleResumeRetry(node, pending, playerSaver, startTime, 0);
		}

		this.logger.info(`Resume completed in ${Date.now() - startTime}ms (${validPlayers.length} players)`);
	}

	/** 길드 캐시 도착을 폴링하다 나타나면 복구하고, 끝내 없으면 서버 플레이어와 기록을 정리한다. */
	private scheduleResumeRetry(
		node: LavalinkNode,
		lavalinkPlayer: LavalinkPlayer,
		playerSaver: ReturnType<typeof this.container.redisStore.getPlayerSaver>,
		startTime: number,
		attempt: number
	): void {
		const guildId = lavalinkPlayer.guildId;
		// 이미 복구됐거나(다른 경로) 길드가 도착했다면 즉시 시도한다.
		if (this.container.audio.players.has(guildId)) return;
		if (this.container.client.guilds.cache.has(guildId)) {
			this.resumeSinglePlayer(node, lavalinkPlayer, playerSaver, startTime).catch((error) => {
				this.logger.error(`Failed to resume player at ${guildId} (retry): ${error}`);
				this.scheduleResumeRetry(node, lavalinkPlayer, playerSaver, startTime, attempt + 1);
			});
			return;
		}
		if ((attempt + 1) * GUILD_WAIT_POLL_MS > GUILD_WAIT_TIMEOUT_MS) {
			this.logger.info(`Resume cancelled at ${guildId}: guild not available after ${GUILD_WAIT_TIMEOUT_MS}ms`);
			void node.destroyPlayer(guildId).catch(() => null);
			void playerSaver.delete(guildId).catch(() => null);
			return;
		}
		const timer = setTimeout(() => {
			this.restoreTimers.delete(timer);
			this.scheduleResumeRetry(node, lavalinkPlayer, playerSaver, startTime, attempt + 1);
		}, GUILD_WAIT_POLL_MS);
		this.restoreTimers.add(timer);
	}

	private async resumeSinglePlayer(
		node: LavalinkNode,
		lavalinkPlayer: LavalinkPlayer,
		playerSaver: ReturnType<typeof this.container.redisStore.getPlayerSaver>,
		startTime: number
	) {
		// 다른 경로에서 이미 복구됐으면 재생성하지 않는다.
		if (this.container.audio.players.has(lavalinkPlayer.guildId)) {
			this.logger.debug(`Client player already exists at ${lavalinkPlayer.guildId}, skipping resume recreate`);
			return;
		}

		// 재시도 경로도 동일한 stale 기준을 적용한다 — 오래된 상태로 복구하면 어긋난 위치부터 재생한다.
		if (lavalinkPlayer.state.time && startTime - lavalinkPlayer.state.time > RESUME_STALE_THRESHOLD_MS) {
			this.logger.info(`Skipping stale player at ${lavalinkPlayer.guildId} (retry path)`);
			await node.destroyPlayer(lavalinkPlayer.guildId).catch(() => null);
			await playerSaver.delete(lavalinkPlayer.guildId).catch(() => null);
			return;
		}

		const savedPlayer = await playerSaver.get(lavalinkPlayer.guildId);
		if (!savedPlayer) {
			// 기록이 없는 서버 플레이어는 통제 불가능한 고아 — 재생을 멈추고 정리한다.
			this.logger.info(`No saved player at guild ${lavalinkPlayer.guildId}, destroying orphan server player`);
			await node.destroyPlayer(lavalinkPlayer.guildId).catch((error) => {
				this.logger.debug(`Failed to destroy orphan player at ${lavalinkPlayer.guildId}: ${error}`);
			});
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

			// volume은 filters가 아니라 playerOptions로 보낸다(부분 filters op는 서버의 필터
			// 상태 전체를 덮어써 mixer 플러그인 키를 지운다). 이전 세션의 true 값도 무시한다.
			applyVolumeAsFilter: false,
			instaUpdateFiltersFix: savedPlayer.options.instaUpdateFiltersFix,
			vcRegion: savedPlayer.options.vcRegion
		});

		await this.restoreControllerRef(createdPlayer, savedPlayer.textChannelId, savedPlayer.messageId, `guild ${lavalinkPlayer.guildId}`);

		await createdPlayer.connect();
		createdPlayer.filterManager.data = savedPlayer.filters;
		await createdPlayer.queue.utils.sync(true, false).catch(this.logger.error.bind(this));

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

		this.logger.debug(`Finished resuming player at ${lavalinkPlayer.guildId}`);
	}

	/** 이전 세션의 컨트롤러 메시지(채널+메시지 id)를 다시 붙인다 — 실패해도 다음 trackStart가 새 메시지를 보낸다. */
	private async restoreControllerRef(
		createdPlayer: CustomPlayer,
		textChannelId: string | null | undefined,
		messageId: string | null | undefined,
		label: string
	): Promise<void> {
		if (!textChannelId || !messageId) return;
		this.logger.debug(`Setting cached controller message and message id for ${label}`);
		const fetchedChannel = await this.container.client.channels.fetch(textChannelId).catch(() => null);
		if (fetchedChannel && fetchedChannel.isTextBased()) {
			const message = await fetchedChannel.messages.fetch(messageId).catch(() => null);
			this.logger.debug(`Fetched controller message for ${label}`);
			if (message?.editable) {
				createdPlayer.messageId = message.id;
				createdPlayer.controller = message;
			}
		}
	}

	/**
	 * fresh 세션 복구: 이전 세션을 못 써서 서버에 플레이어가 없어도
	 * Redis의 플레이어/큐 기록에서 재구성한다(음성채널 점유 + 신선도 조건 충족 시).
	 * 길드 캐시 대기(최대 90초)가 길드별로 병렬로 돌아야 하므로 배치 단위로 처리한다 —
	 * 순차 처리면 앞 길드의 대기 시간이 뒤 길드 전체로 누적된다.
	 */
	private async restoreFreshSession(node: LavalinkNode): Promise<void> {
		const playerSaver = this.container.redisStore.getPlayerSaver();
		const guildIds = await playerSaver.listGuildIds();
		if (guildIds.length === 0) return;
		this.logger.info(`Fresh session restore: ${guildIds.length} saved player(s) found`);

		for (let i = 0; i < guildIds.length; i += RESTORE_BATCH_SIZE) {
			const batch = guildIds.slice(i, i + RESTORE_BATCH_SIZE);
			const results = await Promise.allSettled(batch.map((guildId) => this.restoreFreshGuild(node, guildId, playerSaver)));
			for (const result of results) {
				if (result.status === 'rejected') this.logger.error(`Fresh restore failed: ${result.reason}`);
			}
		}
	}

	/** 단일 길드의 fresh 복구 — 조건 불충분 시 기록을 지우는 대신 건너뛴다(다음 재시작 재시도). */
	private async restoreFreshGuild(
		node: LavalinkNode,
		guildId: string,
		playerSaver: ReturnType<typeof this.container.redisStore.getPlayerSaver>
	): Promise<void> {
		// 다른 경로(재접속 등)에서 이미 복구됐으면 건너뛴다.
		if (this.container.audio.players.has(guildId)) return;
		const saved = await playerSaver.get(guildId);
		if (!saved) return;

		// 오래된 잔재는 복구하지 않고 정리한다.
		const age = saved.savedAt !== undefined ? Date.now() - saved.savedAt : Number.POSITIVE_INFINITY;
		if (age > FRESH_RESTORE_MAX_AGE_MS) {
			this.logger.info(`Discarding stale saved player at ${guildId} (${Math.round(age / 60_000)}min old)`);
			await this.discardSavedPlayer(guildId, saved, playerSaver);
			return;
		}

		// READY 직후엔 GUILD_CREATE가 스트리밍 중일 수 있다 — 캐시 도착을 기다린다.
		if (!(await this.waitForGuild(guildId))) {
			// 길드가 안 온다고 기록을 지우면 복구 기회를 잃는다 — 남겨 두고 다음
			// 재시작 때 재시도한다. (기록은 6h 신선도 한도에서 자연히 소멸한다.)
			this.logger.info(`Fresh restore deferred at ${guildId}: guild not available after ${GUILD_WAIT_TIMEOUT_MS}ms (records kept)`);
			return;
		}

		// 음성채널에 사람이 없으면 재연결하지 않는다(무인 재생 방지).
		if (!(await this.isVoiceChannelOccupied(saved.voiceChannelId))) {
			this.logger.info(`Discarding saved player at ${guildId}: voice channel empty or missing`);
			await this.discardSavedPlayer(guildId, saved, playerSaver);
			return;
		}

		await this.restoreFreshPlayer(node, guildId, saved);
	}

	/** 길드가 캐시에 올 때까지 폴링한다. */
	private async waitForGuild(guildId: string): Promise<boolean> {
		const deadline = Date.now() + GUILD_WAIT_TIMEOUT_MS;
		while (Date.now() < deadline) {
			if (this.container.client.guilds.cache.has(guildId)) return true;
			await new Promise((resolve) => setTimeout(resolve, GUILD_WAIT_POLL_MS));
		}
		return this.container.client.guilds.cache.has(guildId);
	}

	/** 음성채널에 봇이 아닌 멤버가 최소 1명 있는지 — 없으면 재연결하지 않는다. */
	private async isVoiceChannelOccupied(channelId: string | null | undefined): Promise<boolean> {
		if (!channelId) return false;
		try {
			const channel =
				this.container.client.channels.cache.get(channelId) ?? (await this.container.client.channels.fetch(channelId).catch(() => null));
			if (channel?.type !== ChannelType.GuildVoice && channel?.type !== ChannelType.GuildStageVoice) return false;
			return channel.members.some((member) => !member.user.bot);
		} catch {
			return false;
		}
	}

	/** 복구하지 않는 플레이어 기록 정리: 컨트롤러 메시지 + 플레이어/큐 저장 키 제거. */
	private async discardSavedPlayer(
		guildId: string,
		saved: { textChannelId?: string | null; messageId?: string | null } | null,
		playerSaver: ReturnType<typeof this.container.redisStore.getPlayerSaver>
	): Promise<void> {
		if (saved?.textChannelId && saved.messageId) {
			const channel = await this.container.client.channels.fetch(saved.textChannelId).catch(() => null);
			const message = channel?.isTextBased() ? await channel.messages.fetch(saved.messageId).catch(() => null) : null;
			if (message?.deletable) {
				await message.delete().catch(() => null);
			}
		}
		await playerSaver.delete(guildId).catch(() => null);
		await this.container.redisStore
			.getQueueStore()
			.delete(guildId)
			.catch(() => null);
	}

	/** 저장된 위치를 기반으로 복구 시 재생 위치를 추정한다(저장 이후 경과 시간 반영). */
	private estimatePosition(saved: { position?: number; lastPosition?: number; lastPositionChange?: number | null; savedAt?: number }): number {
		const base = saved.lastPosition ?? saved.position ?? 0;
		const at = saved.lastPositionChange ?? saved.savedAt ?? 0;
		if (base <= 0 || at <= 0) return 0;
		const elapsed = Date.now() - at;
		if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > FRESH_RESTORE_MAX_AGE_MS) return Math.max(0, base);
		return Math.max(0, base + elapsed);
	}

	/** fresh 세션에서 단일 플레이어를 재구성하고 재생을 재개한다. */
	private async restoreFreshPlayer(node: LavalinkNode, guildId: string, saved: SavedPlayer): Promise<void> {
		const createdPlayer = await this.container.audio.createPlayer({
			guildId,
			voiceChannelId: saved.voiceChannelId,
			textChannelId: saved.textChannelId,
			selfDeaf: saved.options.selfDeaf,
			selfMute: saved.options.selfMute,
			node: node.id,
			applyVolumeAsFilter: false,
			instaUpdateFiltersFix: saved.options.instaUpdateFiltersFix,
			vcRegion: saved.options.vcRegion
		});

		await this.restoreControllerRef(createdPlayer, saved.textChannelId, saved.messageId, `guild ${guildId} (fresh)`);
		await createdPlayer.connect();

		// 새 세션에는 이전 필터/예열 슬롯이 없다 — 다음 play에서 다시 prime 하도록 표시한다.
		this.container.mixerService.markFiltersStale(guildId);

		// 큐(current/대기열/이전곡)를 Redis 큐 저장소에서 되살린다.
		await createdPlayer.queue.utils.sync(true, false);

		if (!createdPlayer.queue.current) {
			// 복구할 재생 상태가 없음 → 기록과 컨트롤러를 정리한다.
			this.logger.info(`Fresh restore: no queue to restore at ${guildId}, discarding`);
			await createdPlayer.destroy('FreshRestoreEmpty').catch(() => null);
			await this.discardSavedPlayer(guildId, saved, this.container.redisStore.getPlayerSaver());
			return;
		}

		await createdPlayer.play({ noReplace: true });

		// 위치·일시정지 상태를 되살린다.
		const duration = createdPlayer.queue.current.info.duration ?? 0;
		let position = this.estimatePosition(saved);
		if (duration > 0) position = Math.min(position, Math.max(0, duration - 1500));
		if (position > 1000) {
			await createdPlayer.seek(position).catch((error) => this.logger.debug(`Fresh restore seek failed at ${guildId}: ${error}`));
		}
		if (saved.paused) {
			await createdPlayer.pause().catch(() => null);
		}

		this.logger.info(`Fresh restore finished at ${guildId} (position ${Math.round(position / 1000)}s${saved.paused ? ', paused' : ''})`);
	}

	private handleNodeDisconnect(node: LavalinkNode, reason: { code?: number | undefined; reason?: string | undefined }) {
		this.logger.info(`Node disconnected: ${node.options.id} | ${reason.reason}`);
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
			orphanPlayers[idx].changeNode(leastUsedNode[idx % leastUsedNode.length]);
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
		this.logger.error(`Node error: ${node.options.id}`, error, payload);
	}

	public cleanup(): void {
		this.logger.info('Cleanup lavalink nodeHandler');
		for (const timer of this.restoreTimers) clearTimeout(timer);
		this.restoreTimers.clear();
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
