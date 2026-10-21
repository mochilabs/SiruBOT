import { container } from '@sapphire/framework';
import { LavalinkManager, Track, UnresolvedTrack } from 'lavalink-client';
import { ILogObj, Logger } from 'tslog';
import * as Sentry from '@sentry/node';
import { CustomPlayer, TRANSITION_CONFIRM_TIMEOUT_MS } from '../player/customPlayer.ts';
import type { TrackTransitionHost } from './trackHandler.ts';

/** 라이브러리의 지연 continuation(trackEnd 후속 처리)이 settle된 뒤 현재 상태를 복원하는 지연 시간. */
const TRANSITION_RECONCILE_MS = 800;

export type ServerTrackProbe = { known: true; track: Track | null } | { known: false };

/** encoded가 달라도(파일캐시 재구성 등) 같은 영상이면 같은 트랙으로 본다. */
export function isSameTrack(
	a: { encoded?: unknown; info?: { identifier?: unknown } } | null | undefined,
	b: { encoded?: unknown; info?: { identifier?: unknown } } | null | undefined
): boolean {
	const encodedA = a?.encoded;
	const encodedB = b?.encoded;
	if (typeof encodedA === 'string' && encodedA === encodedB) return true;
	const identifierA = a?.info?.identifier;
	const identifierB = b?.info?.identifier;
	return typeof identifierA === 'string' && identifierA.length > 0 && identifierA === identifierB;
}

/** 서버가 시작한 곡을 play 없이 클라이언트 큐에 동기화한다. */
export function syncQueueToNowPlaying(player: CustomPlayer, track: Track | null): void {
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

/**
 * 전이 확인 타이머(watchdog)·전이 확정 리커널(reconcile)·서버 트랙 프로브를 소유한다.
 * 전이 소유권: 서버 슬롯에 예열된 길드는 서버가 trackEnd를 처리하므로 관망하고,
 * 예열하지 않은 길드(갭리스 off / 반복 모드 / trackStart 이후 추가)는 클라이언트가
 * play로 진행한다. 예열 상태는 MixerService가 소유한다.
 */
export class PlaybackWatchdog {
	private readonly watchdogs = new Map<string, ReturnType<typeof setTimeout>>();
	/** 전이 확정 리커널 — 지연 도착한 trackEnd/queueEnd가 current를 덮어쓸 때 실제 재생 곡으로 복원한다. */
	private readonly reconcileTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly confirmTimeoutMs = TRANSITION_CONFIRM_TIMEOUT_MS;

	constructor(
		private readonly host: TrackTransitionHost,
		private readonly logger: Logger<ILogObj>,
		private readonly lavalinkManager: LavalinkManager<CustomPlayer>
	) {}

	private get container() {
		return container;
	}

	/**
	 * 마지막으로 시작한 곡을 기록하고 전이 확정 리커널을 예약한다.
	 * 라이브러리의 지연 continuation(β 순서의 trackEnd, 중복 trackEnd)이
	 * `queue.current`를 비우거나 밀어내 프론트엔드 표시 곡이 어긋나는 것을 복원한다.
	 */
	public setLastStarted(player: CustomPlayer, track: Track | null): void {
		const encoded = (track as { encoded?: unknown } | null)?.encoded;
		player.transitionState.lastStartedEncoded = typeof encoded === 'string' ? encoded : null;
		if (!track || typeof encoded !== 'string') return;

		const guildId = player.guildId;
		this.clearReconcile(guildId);
		this.reconcileTimers.set(
			guildId,
			setTimeout(() => {
				this.reconcileTimers.delete(guildId);
				void this.reconcileNowPlaying(player, track, encoded).catch((error) =>
					this.logger.warn(`[transition] reconcile failed (guild ${guildId}): ${error}`)
				);
			}, TRANSITION_RECONCILE_MS)
		);
	}

	/**
	 * 전이 확정 리커널 본체 — 라이브러리의 지연 continuation이 current를 밀어내면
	 * 서버의 실제 재생 트랙을 기준으로 되돌린다. 서버가 다른 트랙을 재생 중이면
	 * 그쪽이 진실이므로 클라를 서버에 맞춘다.
	 */
	public async reconcileNowPlaying(player: CustomPlayer, track: Track, encoded: string): Promise<void> {
		// 그 사이에 다른 곡이 시작되었거나 정지 명령이 오면 이 리커널은 무효다.
		if (player.transitionState.lastStartedEncoded !== encoded) return;
		if (player.transitionState.stopByCommand) return;
		const currentEncoded = (player.queue.current as { encoded?: unknown } | null)?.encoded;
		if (currentEncoded === encoded) return;

		const probe = await this.fetchServerTrack(player);
		if (!probe.known) {
			// 서버 확인 불가 — 기존 신호로 판단: 재생도 멈췄고 대기열도 비면 정상 종료로 보고 복원하지 않는다.
			if (!player.playing && player.queue.tracks.length === 0) return;
		} else if (probe.track === null) {
			// 서버에 트랙이 없다 — 끝났거나 정지됐다. 복원하지 않는다.
			return;
		} else if (!isSameTrack(probe.track, track)) {
			// 서버가 시작 확정값과 다른 트랙을 재생 중 — 클라가 어긋난 쪽이므로 서버를 따른다.
			this.logger.warn(`[transition] client drifted from server (guild ${player.guildId}), following the server track`);
			syncQueueToNowPlaying(player, probe.track);
			this.setLastStarted(player, probe.track);
			this.container.playerNotifier.updateController(player);
			return;
		}

		this.logger.warn(`[transition] now-playing mismatch after start (guild ${player.guildId}), restoring state`);
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
	}

	/** 종료된 트랙이 이미 시작된(=전이 완료된) 상태인지 — β/중복 이벤트 판별용. */
	public isTransitionAlreadyStarted(player: CustomPlayer, ended: Track | UnresolvedTrack | null): boolean {
		const endedEncoded = (ended as { encoded?: unknown } | null)?.encoded;
		const lastStarted = player.transitionState.lastStartedEncoded;
		return typeof endedEncoded === 'string' && typeof lastStarted === 'string' && endedEncoded !== lastStarted;
	}

	/**
	 * 서버가 실제로 재생 중인 트랙을 REST로 조회한다 (클라 current와 무관).
	 * 조회 실패({known:false})와 서버 무트랙({known:true, track:null})을 구분해
	 * 반환한다 — 실패 시 보수적 판정을 호출부가 결정한다.
	 */
	public async fetchServerTrack(player: CustomPlayer): Promise<ServerTrackProbe> {
		try {
			const serverPlayer = await player.node.fetchPlayer(String(player.guildId));
			if (!serverPlayer || 'status' in serverPlayer || !serverPlayer.track) return { known: true, track: null };
			return { known: true, track: this.lavalinkManager.utils.buildTrack(serverPlayer.track, undefined) };
		} catch (error) {
			this.logger.debug(`[mixer] fetchPlayer failed (guild ${player.guildId}): ${error}`);
			return { known: false };
		}
	}

	/** 서버에 재생 중인 트랙이 있는지 — 확인 불가하면 보수적으로 '있다'로 본다 (play 무음 거부 방지). */
	private async isServerTrackActive(player: CustomPlayer): Promise<boolean> {
		const probe = await this.fetchServerTrack(player);
		return probe.known ? probe.track !== null : true;
	}

	public armWatchdog(player: CustomPlayer, serverActiveObserved: number = 0): void {
		const guildId = player.guildId;
		this.clearWatchdog(guildId);
		this.watchdogs.set(
			guildId,
			setTimeout(() => {
				this.watchdogs.delete(guildId);
				void Promise.resolve()
					.then(async () => {
						// 아직 서버가 트랙을 재생 중이면(긴 크로스페이드/β 전이) 시스템은 살아 있으니 한 번 더 관망한다.
						// 로컬 player.playing은 라이브러리가 일반 trackEnd에서 내리지 않는다(내리는 건 queueEnd와
						// 노드 종료뿐) — 예열 소비 후 서버가 trackStart를 보내지 않는 실패에서는 플래그가 true로
						// 남아 관망만 반복하고 아래 복구 분기에 영원히 도달하지 못한다(무음 교착). 그래서
						// fetchPlayer로 서버의 실제 트랙 유무를 판정한다. fetch 실패는 isServerTrackActive가
						// '활성'으로 보수 판정하므로, 관망 상한(serverActiveObserved)을 넘기면 복구로 내려보내
						// 연속 fetch 실패의 교착도 깬다.
						if (serverActiveObserved < 4 && (await this.isServerTrackActive(player))) {
							this.armWatchdog(player, serverActiveObserved + 1);
							return;
						}
						this.container.mixerService.markUnmanaged(guildId);
						// 서버가 자동 진행하지 않음 (예열 실패 등) → 수동 복구.
						// current에 남은 곡을 직접 재생하는 쪽을 먼저 시도한다.
						// 복구 명령도 조용히 무시되면 다음 주기에 다시 시도한다
						// (정상 시작이면 trackStart가 이 타이머를 지운다).
						if (player.queue.current) {
							// 클라 play는 서버가 이미 트랙을 시작했으면 noReplace로 조용히 무시된다 —
							// 그 상태로 play하면 클라 큐만 소비되어 NOWPLAYING과 출력이 어긋난다.
							// 위 관망 판정(REST 왕복) 사이에 서버가 트랙을 시작했을 수 있으니 play 전에
							// 한 번 더 확인하고, 살아 있으면 클라 상태가 뒤따를 때까지 관망한다.
							// 단, 보수적 판정이 반복되면 영원히 관망만 하게 되므로
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
							// 라이브러리 skip()은 !playing && !current일 때 내부에서 play()를 floating
							// 호출한다 — 이 경로에서는 그 rejection이 unhandled가 되므로, 다음 곡을
							// current에 올려 클라이언트 주도 전이(clearNext → prime → play)로 보낸다.
							const next = player.queue.tracks.shift();
							if (next) player.queue.current = next as (typeof player.queue)['current'];
							return this.host.startClientOwnedTrack(player);
						}
						// 재생할 곡이 없음 — 조기 queueEnd를 관망한 결과 실제 종료로 확정한다.
						return this.host.finishQueue(player);
					})
					.catch((error) => {
						// 복구 명령이 실패하면 이 타이머는 이미 만료됐다 — 실패를 조용히 삼키면
						// 다음 관찰 사이클이 아예 사라져 길드가 무음으로 멈춘다. 실패를 기록하고
						// 사이클을 다시 걸어 위 "다음 주기에 다시 시도" 주석이 실제로 성립하게 한다.
						this.logger.error(`Watchdog recovery failed (guild ${player.guildId}), re-arming watchdog: ${error}`);
						Sentry.withScope((scope) => {
							scope.setTag('handler_context', 'watchdog_recovery');
							scope.setTag('guild_id', player.guildId);
							Sentry.captureException(error);
						});
						this.armWatchdog(player, serverActiveObserved + 1);
					});
			}, this.confirmTimeoutMs)
		);
	}

	/**
	 * 시작이 확정(current === lastStarted)되고 실제 재생 중일 때를 제외하고 확인 타이머를 건다.
	 * trackStart가 이미 처리된 상태라면 불필요한 타이머를 만들지 않고,
	 * no-op이거나 재생이 멈춘 상태에서는 복구 루프를 유지한다.
	 */
	public armWatchdogUnlessStarted(player: CustomPlayer): void {
		const currentEncoded = (player.queue.current as { encoded?: unknown } | null)?.encoded;
		const started = typeof currentEncoded === 'string' && player.transitionState.lastStartedEncoded === currentEncoded;
		if (started && player.playing) return;
		this.armWatchdog(player);
	}

	/** watchdog이 살아 있는지 — 전이 진행 중 여부 판별용. */
	public hasWatchdog(guildId: string): boolean {
		return this.watchdogs.has(guildId);
	}

	public clearReconcile(guildId: string): void {
		const timer = this.reconcileTimers.get(guildId);
		if (timer) {
			clearTimeout(timer);
			this.reconcileTimers.delete(guildId);
		}
	}

	public clearWatchdog(guildId: string): void {
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
	}
}
