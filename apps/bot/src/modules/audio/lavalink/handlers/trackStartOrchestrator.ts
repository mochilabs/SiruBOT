import { container } from '@sapphire/framework';
import { LavalinkManager, Track, TrackStartEvent } from 'lavalink-client';
import { ILogObj, Logger } from 'tslog';
import { CHAPTER_FETCH_MIN_DURATION_MS, resolveYouTubeVideoId } from '@sirubot/utils';
import { queueRelatedUpfront } from '../autoPlayRelated.ts';
import { isTtsClip } from '../requester.ts';
import { fetchYouTubeChapters } from '../../../../services/dataApiClient.ts';
import { reportPlaybackEvent } from '../../../../services/playbackReporter.ts';
import { publishPlayerState } from '../playerStatePublisher.ts';
import { CustomPlayer } from '../player/customPlayer.ts';
import { isSameEncodedTrack, normalizeTrackEncoded, syncQueueToNowPlaying } from './playbackWatchdog.ts';
import type { TrackTransitionHost } from './trackHandler.ts';

/**
 * trackStart 처리를 소유한다: 시작 확정 상태 기록, mixer 배선(runMixerWiring),
 * 챕터 조회, 그리고 채팅 TTS 클립 이어가기(명세 4.2/4.3)를 담당한다.
 */
export class TrackStartOrchestrator {
	constructor(
		private readonly host: TrackTransitionHost,
		private readonly logger: Logger<ILogObj>,
		private readonly lavalinkManager: LavalinkManager<CustomPlayer>
	) {}

	private get container() {
		return container;
	}

	public async handleTrackStart(player: CustomPlayer, track: Track | null, payload: TrackStartEvent) {
		// 예열 소비 후 이어지는 trackStart에서 서버가 시작한 트랙을 대조한다.
		const preloadedIdentifier = this.container.mixerService.takePreloadedIdentifier(player.guildId);
		const startedTrack = this.resolveStartedTrack(player, track, payload, preloadedIdentifier);
		syncQueueToNowPlaying(player, startedTrack);
		// 표시 확정 — 모든 NOWPLAYING 렌더러는 이 값을 그린다.
		// (queue.current는 lavalink-client 전이 기계가 뒤늦게 덮어쓸 수 있다.)
		player.transitionState.confirmedNowPlaying = startedTrack;
		player.transitionState.serverConsumedTrack = null;
		if (player.mixerRuntime) {
			player.mixerRuntime.transitionSeq++;
		}
		player.consecutiveErrors = 0;
		reportPlaybackEvent(player.guildId, 'track_start', startedTrack);
		// 대시보드 라이브 뷰 — fire-and-forget (재생 경로 비블로킹)
		publishPlayerState(player);
		player.transitionState.stopByCommand = false;
		// 예열 소비 확인 창(preloadConsumedAt)은 시작 확정과 함께 닫는다 — 남겨두면 창 안에
		// 도착한 무관한 늦은 queueEnd를 defer해 실제 종료 처리(finishQueue)가 늦어진다.
		player.transitionState.preloadConsumedAt = null;
		this.host.setLastStarted(player, startedTrack);
		this.host.clearAdvancePending(player.guildId);
		this.host.clearWatchdog(player.guildId);
		// 챕터(에피소드) 조회는 네트워크가 필요하므로 재생/알림과 병렬로 돌린다.
		this.loadChapters(player, startedTrack);
		const startedKey = startedTrack
			? ((startedTrack.encoded ? normalizeTrackEncoded(startedTrack.encoded) : null) ??
				startedTrack.info?.identifier ??
				startedTrack.info?.uri ??
				null)
			: null;
		if (startedTrack && !startedTrack.info.isStream && !isTtsClip(startedTrack) && startedKey !== player.transitionState.lastRecordedKey) {
			player.transitionState.lastRecordedKey = startedKey;
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
		if (isTtsClip(startedTrack)) {
			// 채팅 TTS 클립마다 컨트롤러를 다시 보내면 메시지마다 리센드 스팸이 된다 — 알림만 생략한다.
		} else {
			await this.container.playerNotifier.onTrackStart(player);
			// 음악이 시작되면 단독 대기 중이던 TTS 클립은 오버레이로 순서대로 넘어간다 (명세 4.3).
			// 그 전에 시드만 되고 재생되지 않은 단독 TTS 클립 잔재를 큐에서 걷어낸다 (명세 4.2) —
			// 남겨두면 곡 사이에 클립이 메인 트랙으로 재생될 수 있다.
			this.container.chatTtsService.scrubTtsClips(player, null);
			void this.container.chatTtsService
				.drainSoloQueueToAnnounce(player)
				.catch((error) => this.logger.warn(`[chatTts] solo queue drain failed (guild ${player.guildId}): ${error}`));
		}
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

	/**
	 * 채팅 TTS 클립 종료 후속 처리 (명세 4.2/4.3):
	 * 반복 모드가 남긴 TTS 잔재를 걷어낸 뒤, 음악이 대기 중이면 음악을,
	 * 아니면 내부 단독 큐의 다음 클립을 시작하고, 둘 다 없으면 조용히 끝낸다.
	 * 알림·컨트롤러 삭제는 하지 않는다 (TTS 조용한 스킵 규칙).
	 */
	public async continueAfterTtsClip(player: CustomPlayer, track: Track | null): Promise<void> {
		this.container.chatTtsService.scrubTtsClips(player, track);
		if (player.transitionState.stopByCommand) {
			this.container.chatTtsService.clearSoloQueue(player.guildId);
			return;
		}
		// mixer 예열 슬롯이 남아 있으면 서버가 다음 트랙을 시작한다 — bookkeeping만 하고 관망한다.
		if (this.container.mixerService.consumePreloaded(player.guildId)) {
			player.transitionState.preloadConsumedAt = Date.now();
			const preheated = player.queue.tracks[0] ?? null;
			if (preheated) player.transitionState.serverConsumedTrack = preheated as Track;
			if (!this.host.isTransitionAlreadyStarted(player, track)) this.host.armWatchdog(player);
			return;
		}
		if (this.host.hasWatchdog(player.guildId)) return;

		const current = player.queue.current as Track | null;
		if (current && !isTtsClip(current)) {
			// 음악 대기 중 — 클라이언트가 다음 곡을 시작한다
			await this.host.startClientOwnedTrack(player);
			return;
		}
		if (current) {
			// 이미 다음 TTS 클립이 시작됐다 (중복 이벤트) — 건드리지 않는다
			return;
		}
		const seeded = await this.container.chatTtsService.seedNextSoloClip(player);
		if (!seeded) {
			await this.quietEndTts(player);
			return;
		}
		const next = player.queue.tracks.shift();
		if (next) player.queue.current = next as (typeof player.queue)['current'];
		if (player.queue.current) {
			await this.host.startClientOwnedTrack(player);
			return;
		}
		await this.quietEndTts(player);
	}

	/** TTS 조용한 종료 — 알림·컨트롤러 삭제 없이 상태만 정리하고, TTS가 켜진 길드면 음성에 남는다. */
	public async quietEndTts(player: CustomPlayer): Promise<void> {
		player.transitionState.lastStartedEncoded = null;
		player.transitionState.preloadConsumedAt = null;
		player.transitionState.confirmedNowPlaying = null;
		player.transitionState.serverConsumedTrack = null;
		player.playing = false;
		publishPlayerState(player);
		await this.container.chatTtsService.keepAliveForTts(player);
	}

	/**
	 * Lavalink payload가 실제 시작한 곡과 클라이언트 current가 다르면 payload를 우선한다.
	 *
	 * 단, encoded만 다르고 identifier가 큐의 트랙과 같으면 서버가 같은 영상을 다른
	 * 메타데이터로 재구성한 것으로 본다 (예: lavalink_file_cache의 stale 메타데이터로
	 * trackStart payload가 만들어진 경우). 이때는 봇이 검색한 신선한 메타데이터를 가진
	 * 큐의 트랙 객체를 단일 source of truth로 써서 표시와 실제 재생이 어긋나지 않게 한다.
	 */
	public resolveStartedTrack(
		player: CustomPlayer,
		track: Track | null,
		payload: TrackStartEvent,
		preloadedIdentifier: string | null
	): Track | null {
		const payloadEncoded = payload.track?.encoded;
		const currentEncoded = (track as { encoded?: unknown } | null)?.encoded;
		if (!payloadEncoded || isSameEncodedTrack(payloadEncoded, currentEncoded)) return track;

		const payloadIdentifier = payload.track?.info?.identifier;
		const currentIdentifier = (track as { info?: { identifier?: unknown } } | null)?.info?.identifier;
		// 클라이언트 current 자체가 서버가 시작한 것과 같은 영상이면(클라이언트 소유 전이 등)
		// 서버 메타데이터 대신 클라이언트 객체를 쓴다 — 표시의 단일 source of truth.
		if (typeof payloadIdentifier === 'string' && payloadIdentifier.length > 0 && track && currentIdentifier === payloadIdentifier) {
			return track;
		}
		if (typeof payloadIdentifier === 'string' && payloadIdentifier.length > 0 && Array.isArray(player.queue.tracks)) {
			// 같은 identifier(같은 영상)의 큐 트랙이 있으면 그 객체를 쓴다.
			const queued = player.queue.tracks.find(
				(t: unknown) =>
					(t as { encoded?: unknown })?.encoded != null &&
					(t as { info?: { identifier?: unknown } })?.info?.identifier === payloadIdentifier
			);
			if (queued) {
				this.logger.debug(`[transition] trackStart resolved by identifier (guild ${player.guildId}): using queued track for display`);
				return queued as Track;
			}
			// 예열한 곡도 큐에 있는 곡도 아닌 트랙이 시작됐다 — 서버(믹서/파일 캐시)가
			// 예상 밖의 트랙을 재생한 것이므로 경고로 남긴다.
			if (preloadedIdentifier && preloadedIdentifier !== payloadIdentifier) {
				this.logger.warn(
					`[transition] unexpected track started (guild ${player.guildId}): preloaded=${preloadedIdentifier}, started=${payloadIdentifier}`
				);
			}
		}
		if (typeof payloadIdentifier === 'string' && payloadIdentifier.length > 0 && Array.isArray(player.queue.previous)) {
			const prev = player.queue.previous.find((t) => t?.info?.identifier === payloadIdentifier);
			if (prev) {
				return prev as Track;
			}
		}
		// 아밍으로 소비·확정된 예열곡이 큐에서 빠진 뒤 시작되면(사용자가 큐를 바꿔
		// 재예열된 경우) 서버 payload(file캐시 스냅샷 메타데이터) 대신 봇이 검색한
		// 신선한 객체를 표시에 쓴다.
		const consumed = player.transitionState?.serverConsumedTrack;
		const consumedIdentifier = (consumed as { info?: { identifier?: unknown } } | null)?.info?.identifier;
		if (consumed && typeof payloadIdentifier === 'string' && consumedIdentifier === payloadIdentifier) {
			this.logger.debug(`[transition] trackStart resolved from the server-consumed preheat (guild ${player.guildId})`);
			return consumed;
		}
		return this.lavalinkManager.utils.buildTrack(payload.track, undefined);
	}

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
}
