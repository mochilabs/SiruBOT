import { LavalinkManager, Track, TrackEndEvent, TrackExceptionEvent, TrackStartEvent, TrackStuckEvent, UnresolvedTrack } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { CustomPlayer } from '../player/customPlayer.ts';
import { ContainerBuilder, MessageFlags } from 'discord.js';
import { DEFAULT_COLOR } from '@sirubot/utils';
import { getInFlightRelatedFetch, queueRelatedUpfront } from '../autoPlayRelated.ts';
import { CHAPTER_FETCH_MIN_DURATION_MS, resolveYouTubeVideoId } from '../youtubeChapters.ts';
import { fetchYouTubeChapters } from '../../../../services/dataApiClient.ts';

const MAX_CONSECUTIVE_ERRORS = Number(process.env.MAX_CONSECUTIVE_ERRORS) || 3;
/** 라이브러리의 지연 continuation(trackEnd 후속 처리)이 settle된 뒤 현재 상태를 복원하는 지연 시간. */
const TRANSITION_RECONCILE_MS = 800;

// handlers/trackHandler.ts
export class TrackHandler extends BaseLavalinkHandler {
	/**
	 * 전이 소유권: 서버 슬롯에 예열된 길드는 서버가 trackEnd를 처리하므로 관망하고,
	 * 예열하지 않은 길드(갭리스 off / 반복 모드 / trackStart 이후 추가)는 클라이언트가
	 * play로 진행한다. 예열 상태는 MixerService가 소유한다.
	 */
	private readonly watchdogs = new Map<string, ReturnType<typeof setTimeout>>();
	/** 전이 확정 리커널 — 지연 도착한 trackEnd/queueEnd가 current를 덮어쓸 때 실제 재생 곡으로 복원한다. */
	private readonly reconcileTimers = new Map<string, ReturnType<typeof setTimeout>>();
	/**
	 * 클라이언트가 직접 보낸 play가 queueEnd fallback과 중복되지 않도록 추적한다.
	 * token은 타이머와 경합할 때 오래된 정리가 최신 대기를 지우지 않도록 보호하고,
	 * timer는 play가 서버 재생 중이라 조용히 무시돼도 다음 전이가 영구히 막히지 않도록 한다.
	 */
	private readonly clientAdvancePending = new Map<string, { token: number; timer: ReturnType<typeof setTimeout> }>();
	private advanceTokenSeq = 0;
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
		this.setLastStarted(player, startedTrack);
		this.clearAdvancePending(player.guildId);
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

		// mixer: 필터 보장(정상 경로에서는 primeForPlay가 play 이전에 이미 보낸다 → 여기서는 no-op,
		//        play 이전 prime이 실패했을 때의 재시도) → 다음 곡 예열.
		// 슬롯 공백을 줄이기 위해 컨트롤러 알림과 병렬로 먼저 시작한다.
		const mixerWiring = this.runMixerWiring(player, startedTrack);
		await this.container.playerNotifier.onTrackStart(player);
		await mixerWiring;
	}

	/** trackStart의 mixer 배선 — 예열 슬롯 갱신과 추천 선예열을 컨트롤러 알림과 병렬로 수행한다. */
	private async runMixerWiring(player: CustomPlayer, startedTrack: Track | null): Promise<void> {
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
			player.setData('preloadConsumedAt', Date.now());
			// β 순서(시작 먼저): 이미 다음 곡이 시작된 상태라면 확인 타이머가 필요 없다.
			// α 순서(종료 먼저): 마지막 시작곡이 방금 끝났으므로 전이 확인 타이머를 건다.
			if (!this.isTransitionAlreadyStarted(player, track)) {
				this.armWatchdog(player);
			}
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
		this.clearAdvancePending(player.guildId);
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
			player.setData('preloadConsumedAt', Date.now());
			if (!this.isTransitionAlreadyStarted(player, track)) {
				this.armWatchdog(player);
			}
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
		this.clearAdvancePending(player.guildId);
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
			player.setData('preloadConsumedAt', Date.now());
			if (!this.isTransitionAlreadyStarted(player, track)) {
				this.armWatchdog(player);
			}
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

	private async handleQueueEnd(
		player: CustomPlayer,
		track: Track | UnresolvedTrack | null,
		_payload: TrackEndEvent | TrackStuckEvent | TrackExceptionEvent
	) {
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

		// (b) 조기 queueEnd — 크로스페이드/전이 창에 이미 새 곡이 재생 중이다.
		// queueEnd() 진입 시 라이브러리가 playing=false로 만들지만 그 사이 trackStart가
		// 도착하면 true로 되돌아온다. 이때 "모두 재생 완료"를 보내면 재생은 계속된다.
		if (player.playing) {
			this.logger.debug(`[mixer] queueEnd deferred: still playing (guild ${player.guildId})`);
			this.armWatchdog(player);
			return;
		}

		// (b) 방금 시작한 곡과 다른 트랙의 queueEnd — 과거/중복 이벤트로 보고 관망한다.
		const lastStarted = player.getData('lastStartedEncoded');
		const endedEncoded = (track as { encoded?: unknown } | null)?.encoded;
		if (typeof lastStarted === 'string' && typeof endedEncoded === 'string' && endedEncoded !== lastStarted) {
			this.logger.debug(`[mixer] queueEnd deferred: stale event for ${endedEncoded} (guild ${player.guildId})`);
			this.armWatchdog(player);
			return;
		}

		// (b) 예열 슬롯을 방금 소비했다(종료 먼저 온 α 순서) — 서버 전이가 곧 trackStart로 확인된다.
		const consumedAt = player.getData('preloadConsumedAt') as number | undefined;
		if (consumedAt && Date.now() - consumedAt < this.confirmTimeoutMs) {
			this.logger.debug(`[mixer] queueEnd deferred: preloaded slot consumed just now (guild ${player.guildId})`);
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

		// 대기열의 모든 곡이 끝났다.
		await this.finishQueue(player);
	}

	/** 큐의 실제 종료 처리: 컨트롤러를 삭제하고 안내를 보낸다. 전이 확정 리커널을 무효화한다. */
	private async finishQueue(player: CustomPlayer): Promise<void> {
		this.clearWatchdog(player.guildId);
		// 종료됐는데 지연 도착한 리커널이 current를 되살리지 않도록 기대치를 비운다.
		player.setData('lastStartedEncoded', undefined);
		player.setData('preloadConsumedAt', undefined);
		await this.container.playerNotifier.deleteController(player);

		if (!player.getData('stopByCommand')) {
			await this.sendNotification(player, '📭 대기열의 모든 곡을 재생했어요.');
		}
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
		this.clearAdvancePending(player.guildId);
		this.clearReconcile(player.guildId);
		this.clearWatchdog(player.guildId);
		player.setData('lastStartedEncoded', undefined);
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

	/**
	 * 마지막으로 시작한 곡을 기록하고 전이 확정 리커널을 예약한다.
	 * 라이브러리의 지연 continuation(β 순서의 trackEnd, 중복 trackEnd)이
	 * `queue.current`를 비우거나 밀어내 프론트엔드 표시 곡이 어긋나는 것을 복원한다.
	 */
	private setLastStarted(player: CustomPlayer, track: Track | null): void {
		const encoded = (track as { encoded?: unknown } | null)?.encoded;
		player.setData('lastStartedEncoded', typeof encoded === 'string' ? encoded : undefined);
		if (!track || typeof encoded !== 'string') return;

		const guildId = player.guildId;
		this.clearReconcile(guildId);
		this.reconcileTimers.set(
			guildId,
			setTimeout(() => {
				this.reconcileTimers.delete(guildId);
				// 그 사이에 다른 곡이 시작되었거나 큐가 종료되면 이 리커널은 무효다.
				if (player.getData('lastStartedEncoded') !== encoded) return;
				if (player.getData('stopByCommand')) return;
				const currentEncoded = (player.queue.current as { encoded?: unknown } | null)?.encoded;
				if (currentEncoded === encoded) return;
				// 실제 재생 중이 아니고 대기열도 비었으면 정상 종료로 보고 복원하지 않는다.
				if (!player.playing && player.queue.tracks.length === 0) return;

				this.logger.warn(`[transition] now-playing mismatch after start (guild ${guildId}), restoring state`);
				const displaced = player.queue.current;
				player.queue.current = track as (typeof player.queue)['current'];
				// 밀려난 current는 다음 곡 후보 → 큐 선두로 되돌린다 (정상 순서 유지).
				if (displaced && (displaced as { encoded?: unknown }).encoded !== encoded && Array.isArray(player.queue.tracks)) {
					player.queue.tracks.unshift(displaced as (typeof player.queue.tracks)[number]);
				}
				// 뷰 복원 전용: 곡은 이미 재생 중이므로 새 컨트롤러를 보내지 않고(edit/send 없이)
				// 기존 메시지 컴포넌트만 다시 그린다. sendController를 부르면 정상 trackStart가
				// 보낸 컨트롤러와 중복 발송 레이스가 생긴다.
				this.container.playerNotifier.updateController(player);
			}, TRANSITION_RECONCILE_MS)
		);
	}

	/** 종료된 트랙이 이미 시작된(=전이 완료된) 상태인지 — β/중복 이벤트 판별용. */
	private isTransitionAlreadyStarted(player: CustomPlayer, ended: Track | UnresolvedTrack | null): boolean {
		const endedEncoded = (ended as { encoded?: unknown } | null)?.encoded;
		const lastStarted = player.getData('lastStartedEncoded');
		return typeof endedEncoded === 'string' && typeof lastStarted === 'string' && endedEncoded !== lastStarted;
	}

	/** 서버에 실제로 트랙이 올라가 재생 중인지 REST로 확인한다 (클라 current와 무관). */
	private async isServerTrackActive(player: CustomPlayer): Promise<boolean> {
		try {
			const serverPlayer = await player.node.fetchPlayer(String(player.guildId));
			if (!serverPlayer || 'status' in serverPlayer) return false;
			return Boolean(serverPlayer.track);
		} catch (error) {
			this.logger.debug(`[mixer] fetchPlayer failed (guild ${player.guildId}): ${error}`);
			// 확인 불가 → 보수적으로 재생 중으로 본다 (play 무음 거부 방지)
			return true;
		}
	}

	private armWatchdog(player: CustomPlayer, serverActiveObserved: number = 0): void {
		const guildId = player.guildId;
		this.clearWatchdog(guildId);
		this.watchdogs.set(
			guildId,
			setTimeout(() => {
				this.watchdogs.delete(guildId);
				// 아직 재생 중이면(긴 크로스페이드/β 전이) 시스템은 살아 있으니 한 번 더 관망한다.
				if (player.playing) {
					this.armWatchdog(player);
					return;
				}
				this.container.mixerService.markUnmanaged(guildId);
				// 서버가 자동 진행하지 않음 (예열 실패 등) → 수동 복구.
				// player.skip()은 대기열이 비어 있으면 RangeError를 던지므로
				// current에 남은 곡을 직접 재생하는 쪽을 먼저 시도한다.
				// 복구 명령도 조용히 무시되면 다음 주기에 다시 시도한다
				// (정상 시작이면 trackStart가 이 타이머를 지운다).
				void Promise.resolve()
					.then(async () => {
						if (player.playing) return;
						if (player.queue.current) {
							// 클라 play는 서버가 이미 트랙을 시작했으면 noReplace로 조용히 무시된다 —
							// 그 상태로 play하면 클라 큐만 소비되어 NOWPLAYING과 출력이 어긋난다.
							// 서버 트랙 존재를 먼저 확인하고, 살아 있으면 클라 상태가 뒤따를 때까지 관망한다.
							// 단, fetchPlayer 실패로 보수적 판정이 반복되면 영원히 관망만 하게 되므로
							// 일정 횟수 이후에는 play를 시도해 교착에서 빠져나온다.
							if (serverActiveObserved < 4 && (await this.isServerTrackActive(player))) {
								this.armWatchdog(player, serverActiveObserved + 1);
								return;
							}
							return this.container.mixerService
								.clearNext(player)
								.catch(() => null)
								.then(() => this.container.mixerService.primeForPlay(player).catch(() => null))
								.then(() => player.play({ noReplace: true }))
								.then(() => this.armWatchdogUnlessStarted(player));
						}
						if (player.queue.tracks.length > 0) {
							return this.container.mixerService
								.skip(player)
								.catch(() => player.skip())
								.then(() => this.armWatchdogUnlessStarted(player));
						}
						// 재생할 곡이 없음 — 조기 queueEnd를 관망한 결과 실제 종료로 확정한다.
						return this.finishQueue(player);
					})
					.catch(() => null);
			}, this.confirmTimeoutMs)
		);
	}

	/**
	 * 시작이 확정(current === lastStarted)되고 실제 재생 중일 때를 제외하고 확인 타이머를 건다.
	 * trackStart가 이미 처리된 상태라면 불필요한 타이머를 만들지 않고,
	 * no-op이거나 재생이 멈춘 상태에서는 복구 루프를 유지한다.
	 */
	private armWatchdogUnlessStarted(player: CustomPlayer): void {
		const currentEncoded = (player.queue.current as { encoded?: unknown } | null)?.encoded;
		const started = typeof currentEncoded === 'string' && player.getData('lastStartedEncoded') === currentEncoded;
		if (started && player.playing) return;
		this.armWatchdog(player);
	}

	/** 서버 슬롯이 없는 전이에서만 호출: stale 슬롯을 비운 뒤 클라이언트가 다음 곡을 시작한다. */
	private async startClientOwnedTrack(player: CustomPlayer): Promise<void> {
		if (this.clientAdvancePending.has(player.guildId)) return;
		const token = this.setAdvancePending(player.guildId);
		// 서버가 이미 트랙을 시작했으면(슬롯 자동 진행이 경합에서 이김) play({noReplace:true})는
		// 조용히 무시되고 클라 큐만 한 칸 소비된다 — NOWPLAYING과 출력이 어긋나는 원인.
		// 진행 전 서버 트랙 존재를 확인해 살아 있으면 클라 상태 동기화와 관망으로 끝낸다.
		if (await this.isServerTrackActive(player)) {
			if (this.clientAdvancePending.get(player.guildId)?.token === token) this.clearAdvancePending(player.guildId);
			this.container.mixerService.markUnmanaged(player.guildId);
			this.setLastStarted(player, player.queue.current);
			// 확인이 오탐이었을 수 있으니 복구 타이머를 유지한다 — 정상 trackStart가 지운다.
			this.armWatchdog(player);
			this.container.playerNotifier.updateController(player);
			return;
		}
		try {
			await this.container.mixerService.clearNext(player).catch(() => null);
			// mixer 필터를 play보다 먼저 보내야 이 트랙의 필터 체인에 포함된다.
			await this.container.mixerService.primeForPlay(player);
			await player.play({ noReplace: true });
			// play가 서버 재생 중이라 조용히 무시돼도 다음 전이가 영구히 막히지 않도록 확인
			// 타이머를 건다. 정상 시작이면 trackStart가 즉시 지우고, no-op이면 watchdog이
			// prime+play로 복구하거나 종료로 확정한다.
			this.armWatchdogUnlessStarted(player);
		} catch (error) {
			if (this.clientAdvancePending.get(player.guildId)?.token === token) {
				this.clearAdvancePending(player.guildId);
			}
			throw error;
		}
	}

	private setAdvancePending(guildId: string): number {
		this.clearAdvancePending(guildId);
		const token = ++this.advanceTokenSeq;
		const timer = setTimeout(() => {
			const entry = this.clientAdvancePending.get(guildId);
			if (entry?.token === token) this.clientAdvancePending.delete(guildId);
		}, this.confirmTimeoutMs);
		this.clientAdvancePending.set(guildId, { token, timer });
		return token;
	}

	private clearAdvancePending(guildId: string): void {
		const entry = this.clientAdvancePending.get(guildId);
		if (entry) clearTimeout(entry.timer);
		this.clientAdvancePending.delete(guildId);
	}

	private clearReconcile(guildId: string): void {
		const timer = this.reconcileTimers.get(guildId);
		if (timer) {
			clearTimeout(timer);
			this.reconcileTimers.delete(guildId);
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
		for (const timer of this.reconcileTimers.values()) clearTimeout(timer);
		this.reconcileTimers.clear();
		for (const entry of this.clientAdvancePending.values()) clearTimeout(entry.timer);
		this.clientAdvancePending.clear();
		this.lavalinkManager?.removeAllListeners('trackStart');
		this.lavalinkManager?.removeAllListeners('trackEnd');
		this.lavalinkManager?.removeAllListeners('trackStuck');
		this.lavalinkManager?.removeAllListeners('trackError');
		this.lavalinkManager?.removeAllListeners('queueEnd');
		this.lavalinkManager?.removeAllListeners('playerDestroy');
	}
}
