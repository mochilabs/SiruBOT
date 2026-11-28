import { ChannelType } from 'discord.js';
import { InvalidLavalinkRestRequest, LavalinkNode, LavalinkPlayer, type Track } from 'lavalink-client';
import type { ILogObj, Logger } from 'tslog';
import { NodeSessionStore } from '../redisStore.ts';
import type { CustomPlayer } from '../player/customPlayer.ts';
import type { LavalinkDeps } from '../deps.ts';
import type { CachedPlayerSaver } from '../player/playerSaver.ts';
import { getTargetNextTrack, getTrackUid } from '../queue/queueWrapper.ts';
import { commitLocal } from './mixerHandlers.ts';
import { isSameEncodedTrack, isSameTrack, normalizeTrackEncoded } from './playbackWatchdog.ts';
type SavedPlayer = NonNullable<Awaited<ReturnType<CachedPlayerSaver['get']>>>;

const FRESH_RESTORE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const RESUME_TIMEOUT_SECONDS = 60;
const GUILD_WAIT_TIMEOUT_MS = 90_000;
const GUILD_WAIT_POLL_MS = 3_000;
const RESUME_STALE_THRESHOLD_MS = 5 * 60 * 1000;
const RESTORE_BATCH_SIZE = 10;
const VOICE_LEAVE_TIMEOUT_MS = 5_000;
const VOICE_LEAVE_POLL_MS = 100;
function delay(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

export class SessionRestoreEngine {
	private readonly restoreTimers = new Set<NodeJS.Timeout>();
	private readonly orphanPlayers = new WeakSet<CustomPlayer>();

	constructor(
		private readonly deps: LavalinkDeps,
		private readonly logger: Logger<ILogObj>
	) {}

	public markOrphanPlayers(players: Iterable<CustomPlayer>): void {
		for (const player of players) this.orphanPlayers.add(player);
	}

	public clearOrphanPlayer(player: CustomPlayer): void {
		this.orphanPlayers.delete(player);
	}

	public async saveNodeSession(node: LavalinkNode): Promise<void> {
		if (!node.sessionId || !this.deps.shardInfo) return;
		try {
			const shardKey = NodeSessionStore.makeShardKey(this.deps.shardInfo.shardIds);
			await this.deps.redisStore.getNodeSessionStore().save(node.id, node.sessionId, shardKey);
		} catch (error) {
			this.logger.warn(`Failed to save session for node ${node.id}: ${error}`);
		}
	}

	public handleReadyOp(node: LavalinkNode, needsFreshRestore: boolean): void {
		// Defer to next tick: 'raw' fires before lavalink-client assigns node.sessionId.
		const timer = setTimeout(() => {
			this.restoreTimers.delete(timer);
			void this.saveNodeSession(node);
			if (node.sessionId) void node.updateSession(true, RESUME_TIMEOUT_SECONDS).catch(() => null);
			if (needsFreshRestore) {
				this.logger.info(`Node ${node.options.id} started a fresh session: restoring players from store`);
				void this.restoreFreshSession(node).catch((error) => this.logger.error(`Fresh session restore failed: ${error}`));
			}
		}, 0);
		this.restoreTimers.add(timer);
	}

	public async handleResumedPlayers(
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
		const playerSaver = this.deps.redisStore.getPlayerSaver();
		const BATCH_SIZE = RESTORE_BATCH_SIZE;

		const validPlayers: LavalinkPlayer[] = [];
		const pendingGuildPlayers: LavalinkPlayer[] = [];
		players.forEach((lavalinkPlayer) => {
			if (!lavalinkPlayer.state.connected) {
				this.logger.debug(`Player at ${lavalinkPlayer.guildId} is already disconnected`);
				playerSaver.delete(lavalinkPlayer.guildId);
				return;
			}

			if (!this.deps.client.guilds.cache.has(lavalinkPlayer.guildId)) {
				pendingGuildPlayers.push(lavalinkPlayer);
				return;
			}

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

		for (const pending of pendingGuildPlayers) {
			this.scheduleResumeRetry(node, pending, playerSaver, startTime, 0);
		}

		this.logger.info(`Resume completed in ${Date.now() - startTime}ms (${validPlayers.length} players)`);
	}

	public scheduleResumeRetry(
		node: LavalinkNode,
		lavalinkPlayer: LavalinkPlayer,
		playerSaver: ReturnType<typeof this.deps.redisStore.getPlayerSaver>,
		startTime: number,
		attempt: number
	): void {
		const guildId = lavalinkPlayer.guildId;
		if (this.deps.audio.players.has(guildId)) return;
		if (this.deps.client.guilds.cache.has(guildId)) {
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

	public async resumeSinglePlayer(
		node: LavalinkNode,
		lavalinkPlayer: LavalinkPlayer,
		playerSaver: ReturnType<typeof this.deps.redisStore.getPlayerSaver>,
		startTime: number
	) {
		const existingPlayer = this.deps.audio.players.get(lavalinkPlayer.guildId);
		if (existingPlayer) {
			await this.deps.mixerService.ensureMixerFilter(existingPlayer).catch((error) => {
				this.logger.warn(`Failed to restore mixer config at ${lavalinkPlayer.guildId}: ${error}`);
			});
			this.logger.debug(`Client player already exists at ${lavalinkPlayer.guildId}, skipping resume recreate`);
			this.orphanPlayers.delete(existingPlayer);
			return;
		}

		if (lavalinkPlayer.state.time && startTime - lavalinkPlayer.state.time > RESUME_STALE_THRESHOLD_MS) {
			this.logger.info(`Skipping stale player at ${lavalinkPlayer.guildId} (retry path)`);
			await node.destroyPlayer(lavalinkPlayer.guildId).catch(() => null);
			await playerSaver.delete(lavalinkPlayer.guildId).catch(() => null);
			return;
		}

		const savedPlayer = await playerSaver.get(lavalinkPlayer.guildId);
		if (!savedPlayer) {
			this.logger.info(`No saved player at guild ${lavalinkPlayer.guildId}, destroying orphan server player`);
			await node.destroyPlayer(lavalinkPlayer.guildId).catch((error) => {
				this.logger.debug(`Failed to destroy orphan player at ${lavalinkPlayer.guildId}: ${error}`);
			});
			return;
		}

		const createdPlayer = await this.recreateSavedPlayer(node, lavalinkPlayer.guildId, savedPlayer, {
			volume: this.deps.audio.options.playerOptions?.volumeDecrementer
				? Math.round(lavalinkPlayer.volume / this.deps.audio.options.playerOptions.volumeDecrementer)
				: lavalinkPlayer.volume,
			restoreFilters: true,
			silentSync: true
		});

		if (lavalinkPlayer.track) {
			const serverEncoded = lavalinkPlayer.track?.encoded;
			const createdQueue = createdPlayer.queue as { tracks?: unknown[] } | undefined;
			const queueTracks = Array.isArray(createdQueue?.tracks) ? (createdQueue.tracks as Track[]) : [];
			const matchIndex = queueTracks.findIndex(
				(t) => (typeof serverEncoded === 'string' && t?.encoded === serverEncoded) || isSameTrack(t, lavalinkPlayer.track)
			);
			if (matchIndex >= 0) {
				const [matched] = queueTracks.splice(0, matchIndex + 1).slice(-1);
				if (createdPlayer.queue.current && !isSameTrack(createdPlayer.queue.current, matched)) {
					createdPlayer.queue.previous.unshift(createdPlayer.queue.current);
					while (createdPlayer.queue.previous.length > 25) createdPlayer.queue.previous.pop();
				}
				createdPlayer.queue.current = matched ?? null;
				void createdPlayer.queue?.utils?.save?.()?.catch(() => null);
			} else if (!createdPlayer.queue.current || !isSameTrack(createdPlayer.queue.current, lavalinkPlayer.track)) {
				createdPlayer.queue.current = this.deps.audio.utils.buildTrack(
					lavalinkPlayer.track,
					createdPlayer.queue.current?.requester || this.deps.client.user
				);
			}
		}
		if (createdPlayer.transitionState && createdPlayer.queue.current) {
			createdPlayer.transitionState.confirmedNowPlaying = createdPlayer.queue.current;
			createdPlayer.transitionState.lastStartedEncoded =
				typeof createdPlayer.queue.current.encoded === 'string' ? normalizeTrackEncoded(createdPlayer.queue.current.encoded) : null;
		}

		const now = Date.now();
		createdPlayer.lastPosition = lavalinkPlayer.state.position + (now - startTime);
		createdPlayer.lastPositionChange = now;
		createdPlayer.ping.lavalink = lavalinkPlayer.state.ping;

		createdPlayer.paused = lavalinkPlayer.paused;
		createdPlayer.playing = !lavalinkPlayer.paused && !!lavalinkPlayer.track;

		let pluginState: { lastKnownEpoch?: number } | null = null;
		try {
			pluginState = await this.deps.mixerService.getState(createdPlayer);
		} catch {
			this.logger.warn(`Mixer state query failed at ${lavalinkPlayer.guildId}`);
		}
		const queueStore = this.deps.redisStore?.getQueueStore?.();
		const savedQueue = queueStore ? await queueStore.get(lavalinkPlayer.guildId).catch(() => null) : null;
		const rawParsed = typeof savedQueue === 'string' ? JSON.parse(savedQueue) : savedQueue;
		const savedEpoch =
			typeof rawParsed?.epoch === 'number' ? rawParsed.epoch : typeof savedPlayer.currentEpoch === 'number' ? savedPlayer.currentEpoch : 1;
		createdPlayer.currentEpoch = Math.max(savedEpoch, pluginState?.lastKnownEpoch ?? 1) + 10;
		if (!createdPlayer.mixerRuntime) {
			createdPlayer.mixerRuntime = { pending: new Map(), transitionSeq: 0, lastTargetUid: null, invalidateTimer: null };
		}

		const serverTrack = lavalinkPlayer.track?.encoded ?? null;
		if (serverTrack && Array.isArray(createdPlayer.queue?.tracks)) {
			const head = createdPlayer.queue.tracks[0] as Track | undefined;
			if (head && isSameEncodedTrack(head.encoded, serverTrack) && !isSameEncodedTrack(createdPlayer.queue.current?.encoded, serverTrack)) {
				commitLocal(this.deps, createdPlayer, head, { invalidate: false, bumpEpoch: false });
			}
		}

		createdPlayer.mixerRuntime.lastTargetUid = getTrackUid(getTargetNextTrack(createdPlayer));

		await this.deps.mixerService?.ensureMixerFilter?.(createdPlayer)?.catch(() => null);
		await this.deps.mixerService?.reset?.(createdPlayer, createdPlayer.currentEpoch)?.catch((error: unknown) => {
			this.logger.warn(
				`Mixer reset after resume failed at ${lavalinkPlayer.guildId}: ${error instanceof Error ? error.message : String(error)}`
			);
		});
		await this.deps.mixerService?.reconcileAfterResume?.(createdPlayer)?.catch(() => null);

		this.logger.debug(`Finished resuming player at ${lavalinkPlayer.guildId} (epoch: ${createdPlayer.currentEpoch})`);
	}

	public async recreateSavedPlayer(
		node: LavalinkNode,
		guildId: string,
		saved: SavedPlayer,
		options: { volume?: number; restoreFilters?: boolean; silentSync?: boolean; resetVoiceState?: boolean } = {}
	): Promise<CustomPlayer> {
		const createdPlayer = await this.deps.audio.createPlayer({
			guildId,
			voiceChannelId: saved.voiceChannelId,
			textChannelId: saved.textChannelId,
			selfDeaf: saved.options.selfDeaf,
			selfMute: saved.options.selfMute,

			node: node.id,
			...(options.volume !== undefined ? { volume: options.volume } : {}),

			// Partial filters ops overwrite server mixer filters, so send volume via playerOptions.
			applyVolumeAsFilter: false,
			instaUpdateFiltersFix: saved.options.instaUpdateFiltersFix,
			vcRegion: saved.options.vcRegion
		});

		if (options.resetVoiceState) {
			try {
				await this.resetVoiceSession(createdPlayer);
			} catch (error) {
				createdPlayer.setData('internal_destroywithoutdisconnect', true);
				this.deps.audio.deletePlayer(guildId);
				throw error;
			}
		}
		createdPlayer.relatedTrackHistory.restore(saved.relatedTrackHistory);
		await this.restoreControllerRef(createdPlayer, saved.textChannelId, saved.messageId, `guild ${guildId}`);
		await createdPlayer.connect();
		if (options.restoreFilters) createdPlayer.filterManager.data = saved.filters;
		const sync = createdPlayer.queue.utils.sync(true, false);
		await (options.silentSync ? sync.catch(this.logger.error.bind(this)) : sync);

		return createdPlayer;
	}

	private async restoreControllerRef(
		createdPlayer: CustomPlayer,
		textChannelId: string | null | undefined,
		messageId: string | null | undefined,
		label: string
	): Promise<void> {
		if (!textChannelId || !messageId) return;
		this.logger.debug(`Setting cached controller message and message id for ${label}`);
		const fetchedChannel = await this.deps.client.channels.fetch(textChannelId).catch(() => null);
		if (fetchedChannel && fetchedChannel.isTextBased()) {
			const message = await fetchedChannel.messages.fetch(messageId).catch(() => null);
			this.logger.debug(`Fetched controller message for ${label}`);
			if (message?.editable) {
				createdPlayer.messageId = message.id;
				createdPlayer.controller = message;
			}
		}
	}

	public async restoreFreshSession(node: LavalinkNode): Promise<void> {
		const playerSaver = this.deps.redisStore.getPlayerSaver();
		const sessionStartedAt = Date.now();
		const savedGuildIds = await playerSaver.listGuildIds();
		if (savedGuildIds.length === 0) return;

		const guildIds = savedGuildIds.filter((guildId) => this.isOwnedByThisShard(guildId));
		const foreignCount = savedGuildIds.length - guildIds.length;
		if (foreignCount > 0) {
			this.logger.info(`Fresh session restore: ignoring ${foreignCount} saved player(s) owned by other shards`);
		}
		if (guildIds.length === 0) return;
		this.logger.info(`Fresh session restore: ${guildIds.length} saved player(s) found`);

		type RestoreTask = { guildId: string; arrived: Promise<boolean> };
		const ready: RestoreTask[] = [];
		const pending: RestoreTask[] = [];
		for (const guildId of guildIds) {
			const cached = this.deps.client.guilds.cache.has(guildId);
			const arrived = cached ? Promise.resolve(true) : this.waitForGuild(guildId);
			(cached ? ready : pending).push({ guildId, arrived });
		}
		const workQueue = [...ready, ...pending];

		const workers = Array.from({ length: Math.min(RESTORE_BATCH_SIZE, workQueue.length) }, async () => {
			for (let task = workQueue.shift(); task !== undefined; task = workQueue.shift()) {
				try {
					await this.restoreFreshGuild(node, task.guildId, playerSaver, sessionStartedAt, task.arrived);
				} catch (error) {
					this.logger.error(`Fresh restore failed for guild ${task.guildId}: ${error}`);
				}
			}
		});
		await Promise.all(workers);
	}

	private isOwnedByThisShard(guildId: string): boolean {
		const shardInfo = this.deps.shardInfo;
		if (!shardInfo || shardInfo.shardCount <= 1 || shardInfo.shardIds.length === 0) return true;
		try {
			const shardId = Number((BigInt(guildId) >> 22n) % BigInt(shardInfo.shardCount));
			return shardInfo.shardIds.includes(shardId);
		} catch {
			return true;
		}
	}

	public async restoreFreshGuild(
		node: LavalinkNode,
		guildId: string,
		playerSaver: ReturnType<typeof this.deps.redisStore.getPlayerSaver>,
		sessionStartedAt: number,
		arrived: Promise<boolean>
	): Promise<void> {
		const saved = await playerSaver.get(guildId);
		if (!saved) return;

		const existingPlayer = this.deps.audio.players.get(guildId);
		const isOrphan = Boolean(existingPlayer && this.orphanPlayers.has(existingPlayer));
		if (existingPlayer) {
			if (existingPlayer.node?.connected && !isOrphan) {
				return;
			}
			this.logger.info(`Dropping orphan player at ${guildId} before fresh session restore`);
			existingPlayer.resettingVoice = true;
			try {
				await existingPlayer.disconnect().catch(() => null);
				existingPlayer.setData('internal_destroywithoutdisconnect', true);
				this.deps.audio.deletePlayer(guildId);
			} catch (err) {
				this.logger.debug(`Error while dropping orphan player at ${guildId}: ${err}`);
			} finally {
				existingPlayer.resettingVoice = false;
			}
		}

		const age = saved.savedAt !== undefined ? sessionStartedAt - saved.savedAt : Number.POSITIVE_INFINITY;
		if (age > FRESH_RESTORE_MAX_AGE_MS) {
			this.logger.info(`Discarding stale saved player at ${guildId} (${Math.round(age / 60_000)}min old)`);
			await this.discardSavedPlayer(guildId, saved, playerSaver);
			return;
		}

		if (!(await arrived)) {
			this.logger.info(`Fresh restore deferred at ${guildId}: guild not available after ${GUILD_WAIT_TIMEOUT_MS}ms (records kept)`);
			return;
		}

		if (!(await this.isVoiceChannelOccupied(saved.voiceChannelId))) {
			this.logger.info(`Discarding saved player at ${guildId}: voice channel empty or missing`);
			await this.discardSavedPlayer(guildId, saved, playerSaver);
			return;
		}
		await this.restoreFreshPlayer(node, guildId, saved, { resetVoiceState: isOrphan });
	}

	private async waitForGuild(guildId: string): Promise<boolean> {
		const deadline = Date.now() + GUILD_WAIT_TIMEOUT_MS;
		while (Date.now() < deadline) {
			if (this.deps.client.guilds.cache.has(guildId)) return true;
			await delay(GUILD_WAIT_POLL_MS);
		}
		return this.deps.client.guilds.cache.has(guildId);
	}

	private async resetVoiceSession(player: CustomPlayer): Promise<void> {
		const guildId = player.guildId;
		const guild = this.deps.client.guilds.cache.get(guildId);
		if (!guild?.members.me) throw new Error(`Cannot confirm Discord voice state for guild ${guildId}`);

		player.resettingVoice = true;
		try {
			this.logger.debug(`Resetting Discord voice state for guild ${guildId} before fresh connect`);
			await player.disconnect();

			const deadline = Date.now() + VOICE_LEAVE_TIMEOUT_MS;
			while (guild.members.me?.voice.channelId !== null) {
				if (Date.now() >= deadline)
					throw new Error(`Discord voice leave not confirmed for guild ${guildId} within ${VOICE_LEAVE_TIMEOUT_MS}ms`);
				await delay(VOICE_LEAVE_POLL_MS);
			}
		} finally {
			player.resettingVoice = false;
		}
	}

	public async isVoiceChannelOccupied(channelId: string | null | undefined): Promise<boolean> {
		if (!channelId) return false;
		try {
			const channel = this.deps.client.channels.cache.get(channelId) ?? (await this.deps.client.channels.fetch(channelId).catch(() => null));
			if (channel?.type !== ChannelType.GuildVoice && channel?.type !== ChannelType.GuildStageVoice) return false;
			return channel.members.some((member) => !member.user.bot);
		} catch {
			return false;
		}
	}

	public async discardSavedPlayer(
		guildId: string,
		saved: { textChannelId?: string | null; messageId?: string | null } | null,
		playerSaver: ReturnType<typeof this.deps.redisStore.getPlayerSaver>
	): Promise<void> {
		if (saved?.textChannelId && saved.messageId) {
			const channel = await this.deps.client.channels.fetch(saved.textChannelId).catch(() => null);
			const message = channel?.isTextBased() ? await channel.messages.fetch(saved.messageId).catch(() => null) : null;
			if (message?.deletable) {
				await message.delete().catch(() => null);
			}
		}
		await playerSaver.delete(guildId).catch(() => null);
		await this.deps.redisStore
			.getQueueStore()
			.delete(guildId)
			.catch(() => null);
	}

	public estimatePosition(saved: { position?: number; lastPosition?: number; lastPositionChange?: number | null; savedAt?: number }): number {
		const base = saved.lastPosition ?? saved.position ?? 0;
		const at = saved.lastPositionChange ?? saved.savedAt ?? 0;
		if (base <= 0 || at <= 0) return 0;
		const elapsed = Date.now() - at;
		if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > FRESH_RESTORE_MAX_AGE_MS) return Math.max(0, base);
		return Math.max(0, base + elapsed);
	}

	public async restoreFreshPlayer(
		node: LavalinkNode,
		guildId: string,
		saved: SavedPlayer,
		options: { resetVoiceState?: boolean } = {}
	): Promise<void> {
		const createdPlayer = await this.recreateSavedPlayer(node, guildId, saved, { resetVoiceState: options.resetVoiceState ?? false });
		this.deps.mixerService.markFiltersStale(guildId);

		if (!createdPlayer.queue.current) {
			this.logger.info(`Fresh restore: no queue to restore at ${guildId}, discarding`);
			await createdPlayer.destroy('FreshRestoreEmpty').catch(() => null);
			await this.discardSavedPlayer(guildId, saved, this.deps.redisStore.getPlayerSaver());
			return;
		}
		if (typeof saved.currentEpoch === 'number') {
			createdPlayer.currentEpoch = Math.max(createdPlayer.currentEpoch ?? 1, saved.currentEpoch + 10);
		}
		if (createdPlayer.mixerRuntime) {
			createdPlayer.mixerRuntime.lastTargetUid = getTrackUid(getTargetNextTrack(createdPlayer));
		}
		// Merge saved filters before enableMixerFilter so custom filters and mixer filter apply atomically.
		if (saved.filters && Object.keys(saved.filters).length > 0) {
			createdPlayer.filterManager.data = {
				...createdPlayer.filterManager.data,
				...saved.filters
			};
		}

		await this.deps.mixerService.enableMixerFilter(createdPlayer).catch(() => null);
		await this.deps.mixerService.pushCrossfadeConfig(createdPlayer).catch(() => null);
		await this.deps.mixerService?.reset?.(createdPlayer, createdPlayer.currentEpoch)?.catch(() => null);

		const duration = createdPlayer.queue.current.info.duration ?? 0;
		let position = this.estimatePosition(saved);
		if (duration > 0) position = Math.min(position, Math.max(0, duration - 1500));

		await createdPlayer.play({
			noReplace: false,
			position: position > 0 ? position : undefined,
			paused: saved.paused
		});

		await this.deps.mixerService.reconcileAfterResume(createdPlayer).catch((error) => {
			this.logger.warn(`Mixer reconcile after fresh restore failed at ${guildId}: ${error}`);
		});
		this.logger.info(`Fresh restore finished at ${guildId} (position ${Math.round(position / 1000)}s${saved.paused ? ', paused' : ''})`);
	}

	public clearTimers(): void {
		for (const timer of this.restoreTimers) clearTimeout(timer);
		this.restoreTimers.clear();
	}
}
