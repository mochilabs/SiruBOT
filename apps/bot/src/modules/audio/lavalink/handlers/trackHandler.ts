import { LavalinkManager, Track, TrackEndEvent, TrackExceptionEvent, TrackStartEvent, TrackStuckEvent, UnresolvedTrack } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { CustomPlayer } from '../player/customPlayer.ts';
import { ContainerBuilder, MessageFlags } from 'discord.js';
import { DEFAULT_COLOR } from '@sirubot/utils';

const MAX_CONSECUTIVE_ERRORS = Number(process.env.MAX_CONSECUTIVE_ERRORS) || 3;

// handlers/trackHandler.ts
export class TrackHandler extends BaseLavalinkHandler {
	/** mixer가 다음 곡을 예열한 길드: trackEnd는 서버가 처리하므로 클라이언트는 관망한다. */
	private readonly serverManaged = new Set<string>();
	private readonly filterReady = new Set<string>();
	private readonly watchdogs = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly confirmTimeoutMs = Number(process.env.MIXER_CONFIRM_TIMEOUT_MS) || 5000;

	constructor(private readonly lavalinkManager: LavalinkManager<CustomPlayer>) {
		super('trackHandler');

		this.lavalinkManager.on('trackStart', this.wrapAsyncHandler(this.handleTrackStart.bind(this), 'trackStart'));
		this.lavalinkManager.on('trackEnd', this.wrapAsyncHandler(this.handleTrackEnd.bind(this), 'trackEnd'));
		this.lavalinkManager.on('trackStuck', this.wrapAsyncHandler(this.handleTrackStuck.bind(this), 'trackStuck'));
		this.lavalinkManager.on('trackError', this.wrapAsyncHandler(this.handleTrackError.bind(this), 'trackError'));
		this.lavalinkManager.on('queueEnd', this.wrapAsyncHandler(this.handleQueueEnd.bind(this), 'queueEnd'));
		this.lavalinkManager.on('playerDestroy', this.wrapAsyncHandler(this.handlePlayerDestroy.bind(this), 'playerDestroy'));
	}

	private async handleTrackStart(player: CustomPlayer, track: Track | null, _payload: TrackStartEvent) {
		this.logger.info(`Track started: ${track?.info.title} by ${track?.info.author}`);
		player.consecutiveErrors = 0;
		this.clearWatchdog(player.guildId);
		if (track && !track.info.isStream) {
			this.logger.trace(`Ensuring track and increasing plays: ${track.info.title} by ${track.info.author}`);
			// fire-and-forget
			this.container.trackService
				.increasePlays(track)
				.then(() => this.container.trackService.addHistory(player.guildId, track))
				.catch((error) => this.logger.error(`Failed to record track history: ${error}`));
		}

		await this.container.playerNotifier.onTrackStart(player);

		// mixer: 필터 보장 → 큐 동기화(서버가 이미 시작했으므로 play 금지) → 다음 곡 예열
		try {
			await this.ensureMixerFilter(player);
			this.syncQueueToNowPlaying(player, track);
			const preloaded = await this.container.mixerService.preloadUpcoming(player).catch((error) => {
				this.logger.warn(`[mixer] preload failed (guild ${player.guildId}): ${error}`);
				return false;
			});
			if (preloaded) this.serverManaged.add(player.guildId);
			else this.serverManaged.delete(player.guildId);
		} catch (error) {
			this.logger.warn(`[mixer] trackStart wiring failed (guild ${player.guildId}): ${error}`);
			this.serverManaged.delete(player.guildId);
		}
	}

	private handleTrackEnd(player: CustomPlayer, track: Track | null, _payload: TrackEndEvent) {
		this.logger.info(`Track ended: ${track?.info.title} by ${track?.info.author}`);
		// 예열된 길드는 서버가 자동 진행한다. 일정 시간 내 trackStart가 없으면 수동 복구.
		if (this.serverManaged.delete(player.guildId)) this.armWatchdog(player);
	}

	private async handleTrackStuck(player: CustomPlayer, track: Track | UnresolvedTrack | null, _payload: TrackStuckEvent) {
		player.consecutiveErrors++;
		this.logger.warn(`Track stuck (${player.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${track?.info.title} by ${track?.info.author}`);

		if (player.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
			this.logger.warn(`Max consecutive errors reached for guild ${player.guildId}, aborting playback`);
			await this.sendNotification(
				player,
				`🚫 연속 재생 오류가 ${MAX_CONSECUTIVE_ERRORS}회 발생했어요. 음성 서버에 문제가 있을 수 있어요. 재생을 중단했어요.`
			);
			player.setData('stopByCommand', true);
			this.serverManaged.delete(player.guildId);
			this.clearWatchdog(player.guildId);
			await player.stopPlaying();
			await player.disconnect();
			return;
		}

		// mixer 예열 길드는 서버가 자동 진행하므로 수동 스킵 금지 (watchdog만).
		if (this.serverManaged.delete(player.guildId)) {
			this.armWatchdog(player);
			return;
		}

		// 중간 오류는 조용히 스킵하고, 마지막(남은 곡 없음)에만 한 번 알린다. (3연속 중단 알림은 위 abort 분기)
		if (player.queue.tracks.length > 0) {
			await this.container.mixerService.skip(player).catch(() => player.skip());
		} else {
			await this.sendNotification(player, `❌ **${track?.info.title ?? '알 수 없는 곡'}** 재생 중 오류가 발생했어요.`);
			// 오류 종료 뒤 queueEnd의 일반 종료 안내가 덧붙지 않도록 억제
			player.setData('stopByCommand', true);
			await player.stopPlaying();
		}
	}

	private async handleTrackError(player: CustomPlayer, track: Track | UnresolvedTrack | null, _payload: TrackExceptionEvent) {
		player.consecutiveErrors++;
		this.logger.warn(`Track error (${player.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${track?.info.title} by ${track?.info.author}`);

		if (player.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
			this.logger.warn(`Max consecutive errors reached for guild ${player.guildId}, aborting playback`);
			await this.sendNotification(
				player,
				`🚫 연속 재생 오류가 ${MAX_CONSECUTIVE_ERRORS}회 발생했어요. 음성 서버에 문제가 있을 수 있어요. 재생을 중단했어요.`
			);
			player.setData('stopByCommand', true);
			this.serverManaged.delete(player.guildId);
			this.clearWatchdog(player.guildId);
			await player.stopPlaying();
			await player.disconnect();
			return;
		}

		// mixer 예열 길드는 서버가 자동 진행하므로 수동 스킵 금지 (watchdog만).
		if (this.serverManaged.delete(player.guildId)) {
			this.armWatchdog(player);
			return;
		}

		// 중간 오류는 조용히 스킵하고, 마지막(남은 곡 없음)에만 한 번 알린다. (3연속 중단 알림은 위 abort 분기)
		if (player.queue.tracks.length > 0) {
			await this.container.mixerService.skip(player).catch(() => player.skip());
		} else {
			await this.sendNotification(player, `❌ **${track?.info.title ?? '알 수 없는 곡'}** 재생 중 오류가 발생했어요.`);
			// 오류 종료 뒤 queueEnd의 일반 종료 안내가 덧붙지 않도록 억제
			player.setData('stopByCommand', true);
			await player.stopPlaying();
		}
	}

	private async handleQueueEnd(player: CustomPlayer) {
		this.logger.info(`Queue ended for guild: ${player.guildId}`);

		// 대기열의 모든 곡이 끝났으므로 컨트롤러 메시지 삭제
		await this.container.playerNotifier.deleteController(player);

		if (!player.getData('stopByCommand')) {
			await this.sendNotification(player, '📭 대기열의 모든 곡을 재생했어요.');
		}

		return;
	}

	private async sendNotification(player: CustomPlayer, message: string) {
		if (!player.textChannelId) return;
		try {
			const channel = this.container.client.channels.cache.get(player.textChannelId);
			if (channel?.isSendable()) {
				await channel.send({
					components: [
						new ContainerBuilder()
							.setAccentColor(DEFAULT_COLOR)
							.addTextDisplayComponents((textDisplay) => textDisplay.setContent(message))
					],
					flags: [MessageFlags.IsComponentsV2]
				});
			}
		} catch (error) {
			this.logger.error(`Failed to send notification: ${error}`);
		}
	}

	private handlePlayerDestroy(player: CustomPlayer): void {
		this.serverManaged.delete(player.guildId);
		this.filterReady.delete(player.guildId);
		this.clearWatchdog(player.guildId);
	}

	// ── mixer helpers ──────────────────────────

	private async ensureMixerFilter(player: CustomPlayer): Promise<void> {
		if (this.filterReady.has(player.guildId)) return;
		try {
			await this.container.mixerService.enableMixerFilter(player);
			await this.container.mixerService.pushCrossfadeConfig(player).catch((error) => {
				this.logger.warn(`[mixer] static config failed for guild ${player.guildId}: ${error}`);
			});
			this.filterReady.add(player.guildId);
		} catch (error) {
			this.logger.warn(`[mixer] enableFilter failed for guild ${player.guildId}, will retry: ${error}`);
		}
	}

	/** 서버가 시작한 곡을 play 없이 클라이언트 큐에 동기화한다. */
	private syncQueueToNowPlaying(player: CustomPlayer, track: Track | null): void {
		const queue = player.queue;
		if (!queue || !track) return;
		const encoded = (track as { encoded?: unknown }).encoded;
		if (Array.isArray(queue.tracks) && typeof encoded === 'string') {
			const index = queue.tracks.findIndex((t: unknown) => (t as { encoded?: unknown })?.encoded === encoded);
			if (index >= 0) {
				const [now] = queue.tracks.splice(index, 1);
				if (queue.current && (queue.current as { encoded?: unknown })?.encoded !== encoded) {
					if (Array.isArray(queue.previous)) {
						queue.previous.unshift(queue.current);
						while (queue.previous.length > 25) queue.previous.pop();
					}
				}
				queue.current = now as Track;
				return;
			}
		}
		if ((queue.current as { encoded?: unknown })?.encoded !== encoded) {
			if (queue.current && Array.isArray(queue.previous)) {
				queue.previous.unshift(queue.current);
				while (queue.previous.length > 25) queue.previous.pop();
			}
			queue.current = track as (typeof queue)['current'];
		}
	}

	private armWatchdog(player: CustomPlayer): void {
		const guildId = player.guildId;
		this.clearWatchdog(guildId);
		this.watchdogs.set(
			guildId,
			setTimeout(() => {
				this.watchdogs.delete(guildId);
				this.serverManaged.delete(guildId);
				// 서버가 자동 진행하지 않음 (예열 실패 등) → 수동 복구
				Promise.resolve()
					.then(() => player.skip())
					.catch(() => null);
			}, this.confirmTimeoutMs)
		);
	}

	private clearWatchdog(guildId: string): void {
		const timer = this.watchdogs.get(guildId);
		if (timer) {
			clearTimeout(timer);
			this.watchdogs.delete(guildId);
		}
	}

	public cleanup() {
		for (const timer of this.watchdogs.values()) clearTimeout(timer);
		this.watchdogs.clear();
		this.serverManaged.clear();
		this.filterReady.clear();
		this.lavalinkManager?.removeAllListeners('trackStart');
		this.lavalinkManager?.removeAllListeners('trackEnd');
		this.lavalinkManager?.removeAllListeners('trackStuck');
		this.lavalinkManager?.removeAllListeners('trackError');
		this.lavalinkManager?.removeAllListeners('queueEnd');
		this.lavalinkManager?.removeAllListeners('playerDestroy');
	}
}
