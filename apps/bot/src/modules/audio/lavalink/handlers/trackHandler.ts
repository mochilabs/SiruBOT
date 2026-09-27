import { LavalinkManager, Track, TrackEndEvent, TrackExceptionEvent, TrackStartEvent, TrackStuckEvent, UnresolvedTrack } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { CustomPlayer } from '../player/customPlayer.ts';
import { ContainerBuilder, MessageFlags } from 'discord.js';
import { DEFAULT_COLOR } from '@sirubot/utils';
import { getInFlightRelatedFetch, queueRelatedUpfront } from '../autoPlayRelated.ts';

const MAX_CONSECUTIVE_ERRORS = Number(process.env.MAX_CONSECUTIVE_ERRORS) || 3;

// handlers/trackHandler.ts
export class TrackHandler extends BaseLavalinkHandler {
	/**
	 * 전이 소유권: 서버 슬롯에 예열된 길드는 서버가 trackEnd를 처리하므로 관망하고,
	 * 예열하지 않은 길드(갭리스 off / 반복 모드 / trackStart 이후 추가)는 클라이언트가
	 * play로 진행한다. 예열 상태는 MixerService가 소유한다.
	 */
	private readonly watchdogs = new Map<string, ReturnType<typeof setTimeout>>();
	/** 클라이언트가 직접 보낸 play가 queueEnd fallback과 중복되지 않도록 추적한다. */
	private readonly clientAdvancePending = new Set<string>();
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

	private async handleTrackStart(player: CustomPlayer, track: Track | null, payload: TrackStartEvent) {
		const startedTrack = this.resolveStartedTrack(track, payload);
		this.syncQueueToNowPlaying(player, startedTrack);
		this.logger.info(`Track started: ${startedTrack?.info.title} by ${startedTrack?.info.author}`);
		player.consecutiveErrors = 0;
		player.setData('stopByCommand', undefined);
		this.clientAdvancePending.delete(player.guildId);
		this.clearWatchdog(player.guildId);
		if (startedTrack && !startedTrack.info.isStream) {
			this.logger.trace(`Ensuring track and increasing plays: ${startedTrack.info.title} by ${startedTrack.info.author}`);
			// fire-and-forget
			this.container.trackService
				.increasePlays(startedTrack)
				.then(() => this.container.trackService.addHistory(player.guildId, startedTrack))
				.catch((error) => this.logger.error(`Failed to record track history: ${error}`));
		}

		await this.container.playerNotifier.onTrackStart(player);

		// mixer: 필터 보장 → 큐 동기화(서버가 이미 시작했으므로 play 금지) → 다음 곡 예열
		try {
			await this.container.mixerService.ensureMixerFilter(player).catch((error) => {
				this.logger.warn(`[mixer] enableFilter failed for guild ${player.guildId}, will retry: ${error}`);
			});
			const preloaded = await this.container.mixerService.preloadUpcoming(player).catch((error) => {
				this.logger.warn(`[mixer] preload failed (guild ${player.guildId}): ${error}`);
				return false;
			});
			// 대기열이 비어 있으면(현재 곡이 마지막) 추천곡을 미리 큐에 추가해
			// 갭리스 자동재생 체인을 유지한다 (repeat/갭리스 off는 헬퍼가 거름)
			if (!preloaded && startedTrack && player.queue.tracks.length === 0) {
				await queueRelatedUpfront(player, startedTrack).catch((error) => {
					this.logger.warn(`[mixer] related pre-add failed (guild ${player.guildId}): ${error}`);
				});
			}
		} catch (error) {
			this.logger.warn(`[mixer] trackStart wiring failed (guild ${player.guildId}): ${error}`);
			this.container.mixerService.markUnmanaged(player.guildId);
		}
	}

	private handleTrackEnd(player: CustomPlayer, track: Track | null, payload: TrackEndEvent) {
		this.logger.info(`Track ended: ${track?.info.title} by ${track?.info.author}`);
		// 예열된 길드는 서버가 자동 진행한다. 일정 시간 내 trackStart가 없으면 수동 복구.
		if (this.container.mixerService.consumePreloaded(player.guildId)) {
			this.armWatchdog(player);
			return;
		}
		if (this.watchdogs.has(player.guildId)) return;

		// 클라이언트 소유 전이: 서버가 예열하지 않은 길드(갭리스 off / 반복 모드 /
		// trackStart 이후 추가된 곡). autoSkip: false라 아무도 진행하지 않으므로
		// 클라이언트가 play로 진행한다. 'replaced'(이전곡 치환)와 'loadFailed'/'cleanup'
		// (trackError/trackStuck 핸들러 소유)는 제외 — 이중 진행 방지.
		if (payload.reason === 'finished' && player.queue.current) {
			void this.startClientOwnedTrack(player).catch((error) =>
				this.logger.error(`Failed to advance track (client-owned transition): ${error}`)
			);
		}
	}

	private async handleTrackStuck(player: CustomPlayer, track: Track | UnresolvedTrack | null, _payload: TrackStuckEvent) {
		this.clientAdvancePending.delete(player.guildId);
		player.consecutiveErrors++;
		this.logger.warn(`Track stuck (${player.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${track?.info.title} by ${track?.info.author}`);

		if (player.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
			this.logger.warn(`Max consecutive errors reached for guild ${player.guildId}, aborting playback`);
			await this.sendNotification(
				player,
				`🚫 연속 재생 오류가 ${MAX_CONSECUTIVE_ERRORS}회 발생했어요. 음성 서버에 문제가 있을 수 있어요. 재생을 중단했어요.`
			);
			player.setData('stopByCommand', true);
			this.container.mixerService.markUnmanaged(player.guildId);
			this.clearWatchdog(player.guildId);
			await player.stopPlaying();
			await player.disconnect();
			return;
		}

		// mixer 예열 길드는 서버가 자동 진행하므로 수동 스킵 금지 (watchdog만).
		if (this.container.mixerService.consumePreloaded(player.guildId)) {
			this.armWatchdog(player);
			return;
		}
		if (this.watchdogs.has(player.guildId)) return;

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
		this.clientAdvancePending.delete(player.guildId);
		player.consecutiveErrors++;
		this.logger.warn(`Track error (${player.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${track?.info.title} by ${track?.info.author}`);

		if (player.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
			this.logger.warn(`Max consecutive errors reached for guild ${player.guildId}, aborting playback`);
			await this.sendNotification(
				player,
				`🚫 연속 재생 오류가 ${MAX_CONSECUTIVE_ERRORS}회 발생했어요. 음성 서버에 문제가 있을 수 있어요. 재생을 중단했어요.`
			);
			player.setData('stopByCommand', true);
			this.container.mixerService.markUnmanaged(player.guildId);
			this.clearWatchdog(player.guildId);
			await player.stopPlaying();
			await player.disconnect();
			return;
		}

		// mixer 예열 길드는 서버가 자동 진행하므로 수동 스킵 금지 (watchdog만).
		if (this.container.mixerService.consumePreloaded(player.guildId)) {
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
		const inFlightRelated = getInFlightRelatedFetch(player.guildId);
		if (inFlightRelated) {
			const addedTrack = await inFlightRelated.catch(() => null);
			if (addedTrack && !player.playing && (player.queue.current || player.queue.tracks.length > 0)) {
				await this.startClientOwnedTrack(player).catch((error) => this.logger.error(`Failed to start pre-added autoplay track: ${error}`));
				return;
			}
			if (addedTrack && (player.queue.current || player.playing)) return;
		}

		// autoPlayFunction은 곡을 current로 옮기지만 autoSkip: false에서는 재생을
		// 시작하지 않는다. 이 경로는 서버 슬롯이 비어 있으므로 클라이언트 play가 맞다.
		if (this.clientAdvancePending.has(player.guildId)) return;
		if (player.queue.current && !player.playing) {
			await this.startClientOwnedTrack(player).catch((error) => this.logger.error(`Failed to start autoplay track: ${error}`));
			return;
		}

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

	private async handlePlayerDestroy(player: CustomPlayer): Promise<void> {
		this.container.mixerService.markUnmanaged(player.guildId);
		this.clientAdvancePending.delete(player.guildId);
		this.clearWatchdog(player.guildId);
		await this.container.mixerService.clearNext(player).catch(() => null);
	}

	// ── mixer helpers ──────────────────────────

	/** Lavalink payload가 실제 시작한 곡과 클라이언트 current가 다르면 payload를 우선한다. */
	private resolveStartedTrack(track: Track | null, payload: TrackStartEvent): Track | null {
		const payloadEncoded = payload.track?.encoded;
		const currentEncoded = (track as { encoded?: unknown } | null)?.encoded;
		if (!payloadEncoded || payloadEncoded === currentEncoded) return track;
		return this.lavalinkManager.utils.buildTrack(payload.track, undefined);
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
				this.container.mixerService.markUnmanaged(guildId);
				// 서버가 자동 진행하지 않음 (예열 실패 등) → 수동 복구
				Promise.resolve()
					.then(() => player.skip())
					.catch(() => null);
			}, this.confirmTimeoutMs)
		);
	}

	/** 서버 슬롯이 없는 전이에서만 호출: stale 슬롯을 비운 뒤 클라이언트가 다음 곡을 시작한다. */
	private async startClientOwnedTrack(player: CustomPlayer): Promise<void> {
		if (this.clientAdvancePending.has(player.guildId)) return;
		this.clientAdvancePending.add(player.guildId);
		try {
			await this.container.mixerService.clearNext(player).catch(() => null);
			await player.play({ noReplace: true });
		} catch (error) {
			this.clientAdvancePending.delete(player.guildId);
			throw error;
		}
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
		this.clientAdvancePending.clear();
		this.lavalinkManager?.removeAllListeners('trackStart');
		this.lavalinkManager?.removeAllListeners('trackEnd');
		this.lavalinkManager?.removeAllListeners('trackStuck');
		this.lavalinkManager?.removeAllListeners('trackError');
		this.lavalinkManager?.removeAllListeners('queueEnd');
		this.lavalinkManager?.removeAllListeners('playerDestroy');
	}
}
