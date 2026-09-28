import { LavalinkManager, Track, TrackEndEvent, TrackExceptionEvent, TrackStartEvent, TrackStuckEvent, UnresolvedTrack } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { CustomPlayer } from '../player/customPlayer.ts';
import { ContainerBuilder, MessageFlags } from 'discord.js';
import { DEFAULT_COLOR } from '@sirubot/utils';
import { getInFlightRelatedFetch, queueRelatedUpfront } from '../autoPlayRelated.ts';
import { CHAPTER_FETCH_MIN_DURATION_MS, fetchYouTubeChapters, resolveYouTubeVideoId } from '../youtubeChapters.ts';

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
		// 챕터(에피소드) 조회는 네트워크가 필요하므로 재생/알림과 병렬로 돌린다.
		this.loadChapters(player, startedTrack);
		if (startedTrack && !startedTrack.info.isStream) {
			this.logger.trace(`Ensuring track and increasing plays: ${startedTrack.info.title} by ${startedTrack.info.author}`);
			// fire-and-forget
			this.container.trackService
				.increasePlays(startedTrack)
				.then(() => this.container.trackService.addHistory(player.guildId, startedTrack))
				.catch((error) => this.logger.error(`Failed to record track history: ${error}`));
		}

		await this.container.playerNotifier.onTrackStart(player);

		// mixer: 필터 보장(정상 경로에서는 primeForPlay가 play 이전에 이미 보낸다 → 여기서는 no-op,
		//        play 이전 prime이 실패했을 때의 재시도) → 다음 곡 예열
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
		this.logger.info(`Track ended: ${track?.info.title} by ${track?.info.author} (reason: ${payload.reason})`);
		// 예열된 길드는 서버가 자동 진행한다. 일정 시간 내 trackStart가 없으면 수동 복구.
		if (this.container.mixerService.consumePreloaded(player.guildId)) {
			this.armWatchdog(player);
			return;
		}
		if (this.watchdogs.has(player.guildId)) return;

		// 클라이언트 소유 전이: 서버가 예열하지 않은 길드(갭리스 off / 반복 모드 /
		// trackStart 이후 추가된 곡). autoSkip: false라 아무도 진행하지 않으므로
		// 클라이언트가 play로 진행한다.
		// - 'finished': 자연 전이
		// - 'stopped': 클라이언트가 보낸 skip(/skip, 오류 복구, watchdog 복구) —
		//   autoSkip: false라 라이브러리가 다음 곡으로 넘기지 않으므로 여기서 진행해야 한다.
		//   '/stop'은 큐를 비운 뒤 queueEnd로 가므로 도달하지 않는다.
		// 'replaced'(이전곡 치환)와 'loadFailed'/'cleanup'(trackError/trackStuck 핸들러 소유)는 제외 — 이중 진행 방지.
		if ((payload.reason === 'finished' || payload.reason === 'stopped') && player.queue.current && !player.getData('stopByCommand')) {
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

		// 서버 예열 슬롯이 남아 있으면 서버가 content end에 자동 진행한다 —
		// 이때 queueEnd를 처리하면 컨트롤러가 삭제되고 "큐 종료" 안내가 나가며,
		// 라이브러리의 onEmptyQueue.destroyAfterMs(10s) 타이머가 걸려 서버가
		// 전이를 시작한 뒤에도 플레이어가 강제 destroy될 수 있다.
		if (this.container.mixerService.isPreloaded(player.guildId)) {
			this.logger.debug(`[mixer] queueEnd deferred: server slot preheated (guild ${player.guildId})`);
			// trackEnd가 라이브러리의 queueEnd 단축분기(라인 2756)로 스킵되면 watchdog이
			// 걸리지 않는다. 서버가 진행하지 않으면 여기서 복구한다.
			this.armWatchdog(player);
			return;
		}

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

		// 선예열이 방금 끝나 in-flight 가드를 놓친 사이 queueEnd가 올 수 있다 —
		// 큐에 추천곡이 남아 있는데 "모두 재생 완료"로 끝내면 곡이 영원히 재생되지 않는다.
		if (!player.playing && player.queue.tracks.length > 0) {
			if (!player.queue.current) {
				const next = player.queue.tracks.shift();
				if (next) player.queue.current = next as (typeof player.queue)['current'];
			}
			if (player.queue.current) {
				await this.startClientOwnedTrack(player).catch((error) => this.logger.error(`Failed to start queued track after queueEnd: ${error}`));
				return;
			}
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

	// ── youtube chapters ──────────────────────

	/**
	 * YouTube 챕터(에피소드)를 REST로 직접 조회해 `player.chapters`에 넣는다.
	 *
	 * SponsorBlock 플러그인은 `categories`가 등록된 길드에서만 `ChaptersLoaded`를 보내고
	 * (기본값 `[]`이면 아예 조회하지 않으므로), lavaplayer는 그 조회가 실패하면
	 * 챕터를 내려주지 않는다. 대부분의 길드는 여기서 챕터를 채운다.
	 */
	private loadChapters(player: CustomPlayer, track: Track | null): void {
		const videoId = resolveYouTubeVideoId(track);
		if (player.chaptersTrackIdentifier !== videoId) {
			player.chapters = [];
			player.chaptersTrackIdentifier = videoId;
		}
		if (!videoId || player.chapters.length > 0) return;

		const duration = track?.info?.duration ?? 0;
		if (duration < CHAPTER_FETCH_MIN_DURATION_MS) return;

		void fetchYouTubeChapters(videoId, duration)
			.then((chapters) => {
				// 그 사이에 다른 트랙으로 바뀌었다면 버린다.
				if (player.chaptersTrackIdentifier !== videoId || chapters.length === 0) return;
				player.chapters = chapters;
				this.container.playerNotifier.updateController(player);
			})
			.catch((error) => this.logger.debug(`[chapters] failed for ${videoId}: ${error}`));
	}

	private armWatchdog(player: CustomPlayer): void {
		const guildId = player.guildId;
		this.clearWatchdog(guildId);
		this.watchdogs.set(
			guildId,
			setTimeout(() => {
				this.watchdogs.delete(guildId);
				this.container.mixerService.markUnmanaged(guildId);
				// 서버가 자동 진행하지 않음 (예열 실패 등) → 수동 복구.
				// player.skip()은 대기열이 비어 있으면 RangeError를 던지므로
				// current에 남은 곡을 직접 재생하는 쪽을 먼저 시도한다.
				Promise.resolve()
					.then(() => {
						if (!player.playing && player.queue.current) {
							return this.container.mixerService
								.primeForPlay(player)
								.catch(() => null)
								.then(() => player.play({ noReplace: true }));
						}
						if (player.queue.tracks.length > 0) return player.skip();
						return null;
					})
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
			// mixer 필터를 play보다 먼저 보내야 이 트랙의 필터 체인에 포함된다.
			await this.container.mixerService.primeForPlay(player);
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
