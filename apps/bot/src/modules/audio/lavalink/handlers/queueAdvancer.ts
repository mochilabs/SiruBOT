import { container } from '@sapphire/framework';
import { ContainerBuilder, MessageFlags } from 'discord.js';
import { LavalinkManager, Track, TrackEndEvent, TrackExceptionEvent, TrackStuckEvent, UnresolvedTrack } from 'lavalink-client';
import { ILogObj, Logger } from 'tslog';
import { DEFAULT_COLOR } from '@sirubot/utils';
import { getInFlightRelatedFetch } from '../autoPlayRelated.ts';
import { isTtsClip } from '../requester.ts';
import { reportPlaybackEvent } from '../../../../services/playbackReporter.ts';
import { clearPlayerStateTracker, publishPlayerEnded, publishPlayerState } from '../playerStatePublisher.ts';
import { CustomPlayer, TRANSITION_CONFIRM_TIMEOUT_MS } from '../player/customPlayer.ts';
import { isSameTrack, syncQueueToNowPlaying } from './playbackWatchdog.ts';
import type { TrackTransitionHost } from './trackHandler.ts';
import { handleMixerTrackEnd } from './mixerHandlers.ts';
const MAX_CONSECUTIVE_ERRORS = Number(process.env.MAX_CONSECUTIVE_ERRORS) || 3;

/**
 * TrackExceptionEvent에서 사람이 읽을 사유를 뽑아요 (연령 제한, 삭제된 영상 등).
 * 라바링크 버전/경로에 따라 exception.message, exception.cause, error가 서로 다르게 채워져 전부 대비하고,
 * data-api 스키마의 reason 상한(200자) 안으로 잘라 보내요.
 */
function extractExceptionReason(payload: TrackExceptionEvent): string | null {
	const raw = payload.exception?.message?.trim() || payload.exception?.cause?.trim() || payload.error?.trim() || '';
	return raw ? raw.slice(0, 200) : null;
}

/**
 * 큐 진행 전이를 소유한다: trackEnd/trackStuck/trackError/queueEnd/playerDestroy 처리,
 * 실제 종료 처리(finishQueue), 그리고 클라이언트 소유 전이(startClientOwnedTrack)의
 * advance-pending 추적을 담당한다.
 */
export class QueueAdvancer {
	/**
	 * 클라이언트가 직접 보낸 play가 queueEnd fallback과 중복되지 않도록 추적한다.
	 * token은 타이머와 경합할 때 오래된 정리가 최신 대기를 지우지 않도록 보호하고,
	 * timer는 play가 서버 재생 중이라 조용히 무시돼도 다음 전이가 영구히 막히지 않도록 한다.
	 */
	private readonly clientAdvancePending = new Map<string, { token: number; timer: ReturnType<typeof setTimeout> }>();
	private advanceTokenSeq = 0;
	private readonly confirmTimeoutMs = TRANSITION_CONFIRM_TIMEOUT_MS;

	constructor(
		private readonly host: TrackTransitionHost,
		private readonly logger: Logger<ILogObj>,
		private readonly lavalinkManager: LavalinkManager<CustomPlayer>
	) {}

	private get container() {
		return container;
	}

	public handleTrackEnd(player: CustomPlayer, track: Track | null, payload: TrackEndEvent) {
		const ended = (payload.track?.encoded ? payload.track : track) as Track | null;
		this.logger.info(
			`Track ended: ${ended?.info?.title ?? track?.info.title} by ${ended?.info?.author ?? track?.info.author} (reason: ${payload.reason})`
		);
		reportPlaybackEvent(player.guildId, 'track_end', ended, { reason: payload.reason });
	}

	public handleTrackEnd(player: CustomPlayer, track: Track | null, payload: TrackEndEvent) {
		const ended = track?.encoded ?? null;
		// 채팅 TTS 클립 전용 진행 — 명세 4.2 (다른 경로와 섞지 않는다).
		if (this.container.chatTtsService.isTtsEnded(player, ended)) {
			if (payload.reason === 'replaced') {
				this.container.chatTtsService.scrubTtsClips(player, ended);
				return;
			}
			void this.host
				.continueAfterTtsClip(player, ended)
				.catch((error) => this.logger.error(`Failed to continue after TTS clip (guild ${player.guildId}): ${error}`));
			return;
		}

		// β 순서(시작 먼저 도착): 이미 새 곡이 시작된 상태에서 도착한 구곡의 trackEnd는
		// 전이가 이미 끝났으므로 관망·예열 소비·클라이언트 진행을 모두 생략한다.
		if (this.host.isTransitionAlreadyStarted(player, ended)) {
			this.logger.debug(`[transition] trackEnd ignored: transition already started (guild ${player.guildId})`);
			return;
		}

		// v2 Protocol: delegating cold-start / natural finish handling to mixerHandlers
		void handleMixerTrackEnd(player, payload);
	}

	public async handleTrackStuck(player: CustomPlayer, track: Track | UnresolvedTrack | null, _payload: TrackStuckEvent) {
		await this.handleTrackFailure(player, track, 'stuck');
	}

	public async handleTrackError(player: CustomPlayer, track: Track | UnresolvedTrack | null, payload: TrackExceptionEvent) {
		await this.handleTrackFailure(player, track, 'error', extractExceptionReason(payload));
	}

	/**
	 * trackStuck/trackError 공통 복구 — 연속 오류 중단, 예열 관망, 조용한 스킵/마지막 곡 안내를 공유한다.
	 * reason은 상태 페이지 '최근 재생 오류'에 사유로 표시돼요 (trackError의 예외 메시지 등).
	 */
	private async handleTrackFailure(
		player: CustomPlayer,
		track: Track | UnresolvedTrack | null,
		kind: 'stuck' | 'error',
		reason: string | null = null
	) {
		// 채팅 TTS 클립 실패는 조용히 스킵한다 (명세 4.6): 알림·연속 오류 중단 없이 다음 클립으로 진행한다.
		if (isTtsClip(track)) {
			this.logger.warn(`[chatTts] TTS clip ${kind} silently skipped (guild ${player.guildId})${reason ? ` (${reason})` : ''}`);
			this.clearAdvancePending(player.guildId);
			// 스킵이 trackEnd/queueEnd를 다시 태워 continueAfterTtsClip으로 이어진다 — 실패하면 직접 진행한다.
			await this.container.mixerService.skip(player).catch((error) => {
				this.logger.warn(`[chatTts] clip skip failed (guild ${player.guildId}), continuing directly: ${error}`);
				return this.host.continueAfterTtsClip(player, track as Track | null);
			});
			return;
		}
		this.clearAdvancePending(player.guildId);
		player.consecutiveErrors++;
		this.logger.warn(
			`Track ${kind} (${player.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${track?.info.title} by ${track?.info.author}${reason ? ` (${reason})` : ''}`
		);
		reportPlaybackEvent(player.guildId, kind === 'stuck' ? 'track_stuck' : 'track_error', track, {
			...(reason ? { reason } : {}),
			consecutiveErrors: player.consecutiveErrors
		});

		if (player.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
			this.logger.warn(`Max consecutive errors reached for guild ${player.guildId}, aborting playback`);
			reportPlaybackEvent(player.guildId, 'playback_abort', track, {
				reason: 'max_consecutive_errors',
				consecutiveErrors: player.consecutiveErrors
			});
			await this.sendNotification(
				player,
				`🚫 연속 재생 오류가 ${MAX_CONSECUTIVE_ERRORS}회 발생했어요. 음성 서버에 문제가 있을 수 있어요. 재생을 중단했어요.`
			);
			player.transitionState.stopByCommand = true;
			this.container.mixerService.markUnmanaged(player.guildId);
			this.host.clearWatchdog(player.guildId);
			await player.stopPlaying();
			await player.disconnect();
			return;
		}

		// mixer 예열 길드는 서버가 자동 진행하므로 수동 스킵 금지 (watchdog만).
		if (this.container.mixerService.consumePreloaded(player.guildId)) {
			player.transitionState.preloadConsumedAt = Date.now();
			// 서버가 예열 슬롯을 소비해 재생을 확정했다 — 이후 큐에서 빠지더라도
			// trackStart 표시 메타데이터 출처로 쓰이게 기록한다 (아밍 소비 인지).
			const preheated = player.queue.tracks[0] ?? null;
			if (preheated) player.transitionState.serverConsumedTrack = preheated as Track;
			if (!this.host.isTransitionAlreadyStarted(player, track)) {
				this.host.armWatchdog(player);
			}
			return;
		}
		if (this.host.hasWatchdog(player.guildId)) return;

		// 중간 오류는 조용히 스킵하고, 마지막(남은 곡 없음)에만 한 번 알린다. (3연속 중단 알림은 위 abort 분기)
		if (player.queue.tracks.length > 0) {
			// raw player.skip() 폴백은 예열 슬롯을 남겨 stale 곡이 뒤늦게 재생된다
			// (docs/3rdparty.md: 스킵은 mixerService를 거쳐야 한다). 스킵이 실패하면
			// watchdog 복구 루프가 수습한다.
			await this.container.mixerService.skip(player).catch((error) => {
				this.logger.warn(`[mixer] error-skip failed (guild ${player.guildId}), deferring to watchdog: ${error}`);
				this.host.armWatchdog(player);
			});
		} else {
			await this.sendNotification(player, `❌ **${track?.info.title ?? '알 수 없는 곡'}** 재생 중 오류가 발생했어요.`);
			// 오류 종료 뒤 queueEnd의 일반 종료 안내가 덧붙지 않도록 억제
			player.transitionState.stopByCommand = true;
			await player.stopPlaying();
		}
	}

	public async handleQueueEnd(
		player: CustomPlayer,
		track: Track | UnresolvedTrack | null,
		_payload: TrackEndEvent | TrackStuckEvent | TrackExceptionEvent
	) {
		this.logger.info(`Queue ended for guild: ${player.guildId}`);
		reportPlaybackEvent(player.guildId, 'queue_end', track);
		// 대시보드 라이브 뷰 — 큐 종료 상태를 즉시 반영 (fire-and-forget)
		publishPlayerState(player);

		// 채팅 TTS 클립으로 큐가 끝난 경우 (명세 4.2/4.3): 다음 단독 클립을 시드해 이어 읽고,
		// 남은 클립이 없으면 조용히 끝낸다 — "모두 재생 완료" 알림·컨트롤러 삭제를 보내지 않는다.
		if (this.container.chatTtsService.isTtsEnded(player, track)) {
			if (player.transitionState.stopByCommand) {
				this.container.chatTtsService.clearSoloQueue(player.guildId);
				return;
			}
			const seeded = await this.container.chatTtsService.seedNextSoloClip(player);
			if (!seeded) {
				await this.host.quietEndTts(player);
				return;
			}
			// 시드 성공 — 아래 기존 분기가 큐의 클립을 시작한다 (defer/watchdog 경로도 tracks에서 찾아 시작한다).
		}

		// 예열 슬롯과 진행 중 크로스페이드는 서버가 전이를 소유한다. trackEnd에서 예열을
		// 이미 소비했거나 구곡 queueEnd와 신곡 시작 사이 레이스에서는 overlap도 함께 본다.
		if (this.container.mixerService.isPreloaded(player.guildId) || this.container.mixerService.isOverlapActive(player.guildId)) {
			this.logger.debug(`[mixer] queueEnd deferred: server owns transition (guild ${player.guildId})`);
			this.host.armWatchdog(player);
			return;
		}

		// (b) 조기 queueEnd — 크로스페이드/전이 창에 이미 새 곡이 재생 중이다.
		// queueEnd() 진입 시 라이브러리가 playing=false로 만들지만 그 사이 trackStart가
		// 도착하면 true로 되돌아온다. 이때 "모두 재생 완료"를 보내면 재생은 계속된다.
		if (player.playing) {
			this.logger.debug(`[mixer] queueEnd deferred: still playing (guild ${player.guildId})`);
			this.host.armWatchdog(player);
			return;
		}

		// (b) 방금 시작한 곡과 다른 트랙의 queueEnd — 과거/중복 이벤트로 보고 관망한다.
		const ended = (_payload?.track?.encoded ? _payload.track : track) as Track | null;
		const lastStarted = player.transitionState.lastStartedEncoded;
		const endedEncoded = (ended as { encoded?: unknown } | null)?.encoded;
		if (typeof lastStarted === 'string' && typeof endedEncoded === 'string' && endedEncoded !== lastStarted) {
			this.logger.debug(`[mixer] queueEnd deferred: stale event for ${endedEncoded} (guild ${player.guildId})`);
			if (!this.host.isTransitionAlreadyStarted(player, ended)) {
				this.host.armWatchdog(player);
			}
			return;
		}

		// (b) 예열 슬롯을 방금 소비했다(종료 먼저 온 α 순서) — 서버 전이가 곧 trackStart로 확인된다.
		const consumedAt = player.transitionState.preloadConsumedAt;
		if (consumedAt && Date.now() - consumedAt < this.confirmTimeoutMs) {
			this.logger.debug(`[mixer] queueEnd deferred: preloaded slot consumed just now (guild ${player.guildId})`);
			this.host.armWatchdog(player);
			return;
		}

		const inFlightRelated = getInFlightRelatedFetch(player.guildId);
		if (inFlightRelated) {
			const addedTrack = await inFlightRelated.catch(() => null);
			if (addedTrack && !player.playing && (player.queue.current || player.queue.tracks.length > 0)) {
				await this.host
					.startClientOwnedTrack(player)
					.catch((error) => this.logger.error(`Failed to start pre-added autoplay track: ${error}`));
				return;
			}
			if (addedTrack && (player.queue.current || player.playing)) return;
		}

		// autoPlayFunction은 곡을 current로 옮기지만 autoSkip: false에서는 재생을
		// 시작하지 않는다. 이 경로는 서버 슬롯이 비어 있으므로 클라이언트 play가 맞다.
		if (this.clientAdvancePending.has(player.guildId)) return;
		if (player.queue.current && !player.playing) {
			await this.host.startClientOwnedTrack(player).catch((error) => this.logger.error(`Failed to start autoplay track: ${error}`));
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
				await this.host
					.startClientOwnedTrack(player)
					.catch((error) => this.logger.error(`Failed to start queued track after queueEnd: ${error}`));
				return;
			}
		}

		// (e) queueEnd인데 서버는 아직 트랙을 재생 중 — 클라이언트 큐만 빈 β 순서 착시다
		// (신곡 trackStart가 큐를 비운 뒤 구곡 trackEnd가 라이브러리 빈큐 단축분기로
		// queueEnd를 직행시킨 경우). 라이브러리는 진입부에서 current=null, playing=false로
		// 덮어쓰고 destroyAfterMs(10s) 타이머를 암 — 그 타이머는 발화 시점에 current가 있으면
		// 스스로 취소되므로, 서버가 재생 중인 트랙을 current로 되살려 재생 중 파괴를 막고
		// 종료 처리를 건너뛴다. 확인(REST)과 판정 사이에 서버 상태가 바뀌는 경합 창은 남는다:
		// 완전 제거가 아니라 빈도 제거가 목표다. 조회 실패 시에는 서버 상태를 알 수 없으니
		// 기존 종료 경로를 그대로 탄다.
		const serverPlayer = await player.node.fetchPlayer(String(player.guildId)).catch(() => null);
		if (serverPlayer && !('status' in serverPlayer) && serverPlayer.track) {
			this.logger.warn(`[mixer] queueEnd deferred: server still has an active track (guild ${player.guildId}), restoring client state`);
			const serverTrack = this.lavalinkManager.utils.buildTrack(serverPlayer.track, undefined);
			player.queue.current = serverTrack as (typeof player.queue)['current'];
			player.transitionState.lastStartedEncoded = typeof serverTrack.encoded === 'string' ? serverTrack.encoded : null;
			// queueEnd가 지운 playing 플래그도 되돌린다 — 일시정지 상태에서는 재생 중이 아니므로 둔다.
			if (!serverPlayer.paused) player.playing = true;
			this.host.armWatchdog(player);
			// 이 복원이 UI에 반영되는 유일한 시점일 수 있다 — queueEnd 경로의 publish는
			// 이미 잘못된 상태로 발행됐다.
			publishPlayerState(player);
			await this.container.playerNotifier.updateController(player);
			return;
		}

		// 대기열의 모든 곡이 끝났다.
		await this.finishQueue(player);
		// 채팅 TTS가 켜진 길드는 음악이 끝나도 음성에 남아 채팅을 계속 읽는다 (명세 4.2).
		await this.container.chatTtsService.keepAliveForTts(player);
	}

	/** 큐의 실제 종료 처리: 컨트롤러를 삭제하고 안내를 보낸다. 전이 확정 리커널을 무효화한다. */
	public async finishQueue(player: CustomPlayer): Promise<void> {
		this.host.clearWatchdog(player.guildId);
		// 종료됐는데 지연 도착한 리커널이 current를 되살리지 않도록 기대치를 비운다.
		player.transitionState.lastStartedEncoded = null;
		player.transitionState.preloadConsumedAt = null;
		player.transitionState.confirmedNowPlaying = null;
		player.transitionState.serverConsumedTrack = null;
		// 대시보드 라이브 뷰 — 종료를 확정 신호(ended)로 알려 마지막 프레임이 유령으로 남지 않게 한다 (fire-and-forget)
		publishPlayerEnded(player);
		await this.container.playerNotifier.deleteController(player);

		if (!player.transitionState.stopByCommand) {
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

	public async handlePlayerDestroy(player: CustomPlayer): Promise<void> {
		this.container.mixerService.markUnmanaged(player.guildId);
		this.container.chatTtsService.clearGuild(player.guildId);
		this.clearAdvancePending(player.guildId);
		this.host.clearReconcile(player.guildId);
		this.host.clearWatchdog(player.guildId);
		player.transitionState.lastStartedEncoded = null;
		player.transitionState.confirmedNowPlaying = null;
		player.transitionState.serverConsumedTrack = null;
		// 대시보드 라이브 뷰 — 플레이어 소멸 상태 추적기 정리
		clearPlayerStateTracker(player.guildId);
		await this.container.mixerService.clearNext(player).catch(() => null);
	}

	/** 서버 슬롯이 없는 전이에서만 호출: stale 슬롯을 비운 뒤 클라이언트가 다음 곡을 시작한다. */
	public async startClientOwnedTrack(player: CustomPlayer): Promise<void> {
		if (this.clientAdvancePending.has(player.guildId)) return;
		const token = this.setAdvancePending(player.guildId);
		// 서버가 이미 트랙을 시작했으면(슬롯 자동 진행이 경합에서 이김) play({noReplace:true})는
		// 조용히 무시되고 클라 큐만 한 칸 소비된다 — NOWPLAYING과 출력이 어긋나는 원인.
		// 진행 전 서버 트랙을 확인해 살아 있으면 클라 상태 동기화와 관망으로 끝낸다.
		const probe = await this.host.fetchServerTrack(player);
		if (probe.known ? probe.track !== null : true) {
			if (this.clientAdvancePending.get(player.guildId)?.token === token) this.clearAdvancePending(player.guildId);
			this.container.mixerService.markUnmanaged(player.guildId);
			// 오염된 current를 시작 확정값으로 도장하면 남은 전이 가드가 전부 무력화된다 —
			// 서버가 재생 중인 트랙이 current와 같을 때만 도장하고, 다르면 서버를 따른다.
			// (확인 불가 시에는 도장하지 않고 관망만 한다 — 정상 trackStart가 도장한다.)
			const serverTrack = probe.known ? probe.track : null;
			if (serverTrack && isSameTrack(serverTrack, player.queue.current)) {
				this.host.setLastStarted(player, player.queue.current);
			} else if (serverTrack) {
				this.logger.warn(`[transition] client advance lost the race (guild ${player.guildId}), following the server track`);
				syncQueueToNowPlaying(player, serverTrack);
				this.host.setLastStarted(player, serverTrack);
			}
			// 확인이 오탐이었을 수 있으니 복구 타이머를 유지한다 — 정상 trackStart가 지운다.
			this.host.armWatchdog(player);
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
			this.host.armWatchdogUnlessStarted(player);
		} catch (error) {
			if (this.clientAdvancePending.get(player.guildId)?.token === token) {
				this.clearAdvancePending(player.guildId);
			}
			// play 실패(라바링크 REST 5xx·노드 재연결 창)에서는 서버에 트랙이 없으므로
			// 이후 재생 이벤트가 하나도 오지 않는다 — watchdog이 미장착이면 복구 타이머도
			// 없어 길드가 무음으로 정체한다. 오류를 호출자에 넘기기 전에 복구 루프를 건다.
			this.host.armWatchdogUnlessStarted(player);
			throw error;
		}
	}

	public setAdvancePending(guildId: string): number {
		this.clearAdvancePending(guildId);
		const token = ++this.advanceTokenSeq;
		const timer = setTimeout(() => {
			const entry = this.clientAdvancePending.get(guildId);
			if (entry?.token === token) this.clientAdvancePending.delete(guildId);
		}, this.confirmTimeoutMs);
		this.clientAdvancePending.set(guildId, { token, timer });
		return token;
	}

	public clearAdvancePending(guildId: string): void {
		const entry = this.clientAdvancePending.get(guildId);
		if (entry) clearTimeout(entry.timer);
		this.clientAdvancePending.delete(guildId);
	}

	public cleanup() {
		for (const entry of this.clientAdvancePending.values()) clearTimeout(entry.timer);
		this.clientAdvancePending.clear();
	}
}
