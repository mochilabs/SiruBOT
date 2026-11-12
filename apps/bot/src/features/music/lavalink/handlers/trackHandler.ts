import { LavalinkManager, Track, TrackEndEvent, TrackExceptionEvent, TrackStartEvent, TrackStuckEvent, UnresolvedTrack } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { CustomPlayer } from '../player/customPlayer.ts';
import { PlaybackWatchdog, ServerTrackProbe } from './playbackWatchdog.ts';
import { QueueAdvancer } from './queueAdvancer.ts';
import { TrackStartOrchestrator } from './trackStartOrchestrator.ts';

/**
 * 협력 클래스 간 위임 계약 — 분리 전 단일 클래스 안에서 서로를 부르던 private 메서드 호출을
 * 그대로 이어준다. TrackHandler가 각 협력 클래스로 위임하므로 외부 호출자(이벤트 배선 등)는
 * 분리 전후로 동일한 시그니처를 본다.
 */
export interface TrackTransitionHost {
	// playbackWatchdog 소유
	hasWatchdog(guildId: string): boolean;
	armWatchdog(player: CustomPlayer, serverActiveObserved?: number): void;
	armWatchdogUnlessStarted(player: CustomPlayer): void;
	clearWatchdog(guildId: string): void;
	setLastStarted(player: CustomPlayer, track: Track | null): void;
	clearReconcile(guildId: string): void;
	isTransitionAlreadyStarted(player: CustomPlayer, ended: Track | UnresolvedTrack | null): boolean;
	fetchServerTrack(player: CustomPlayer): Promise<ServerTrackProbe>;
	// queueAdvancer 소유
	startClientOwnedTrack(player: CustomPlayer): Promise<void>;
	finishQueue(player: CustomPlayer): Promise<void>;
	clearAdvancePending(guildId: string): void;
	// trackStartOrchestrator 소유 (TTS 이어가기)
	continueAfterTtsClip(player: CustomPlayer, track: Track | null): Promise<void>;
	quietEndTts(player: CustomPlayer): Promise<void>;
}

/**
 * Lavalink 재생 이벤트의 진입점(퍼사드) — 이벤트 등록과 협력 클래스 간 위임만 담당한다.
 * - trackStartOrchestrator: 시작 확정·mixer 배선·TTS 이어가기
 * - queueAdvancer: trackEnd/failure/queueEnd/destroy 진행·finishQueue·advance-pending
 * - playbackWatchdog: 전이 확인 타이머·리커널·서버 프로브(타이머 맵 일원화)
 */
export class TrackHandler extends BaseLavalinkHandler implements TrackTransitionHost {
	private readonly playbackWatchdog: PlaybackWatchdog;
	private readonly queueAdvancer: QueueAdvancer;
	private readonly trackStartOrchestrator: TrackStartOrchestrator;

	constructor(private readonly lavalinkManager: LavalinkManager<CustomPlayer>) {
		super('trackHandler');

		this.playbackWatchdog = new PlaybackWatchdog(this, this.logger, lavalinkManager);
		this.queueAdvancer = new QueueAdvancer(this, this.logger, lavalinkManager);
		this.trackStartOrchestrator = new TrackStartOrchestrator(this, this.logger, lavalinkManager);

		this.lavalinkManager.on('trackStart', this.wrapAsyncHandler(this.handleTrackStart.bind(this), 'trackStart'));
		this.lavalinkManager.on('trackEnd', this.wrapAsyncHandler(this.handleTrackEnd.bind(this), 'trackEnd'));
		this.lavalinkManager.on('trackStuck', this.wrapAsyncHandler(this.handleTrackStuck.bind(this), 'trackStuck'));
		this.lavalinkManager.on('trackError', this.wrapAsyncHandler(this.handleTrackError.bind(this), 'trackError'));
		this.lavalinkManager.on('queueEnd', this.wrapAsyncHandler(this.handleQueueEnd.bind(this), 'queueEnd'));
		this.lavalinkManager.on('playerDestroy', this.wrapAsyncHandler(this.handlePlayerDestroy.bind(this), 'playerDestroy'));
	}

	/* ── 이벤트 진입 위임 (등록 시그니처는 분리 전과 동일) ── */

	private async handleTrackStart(player: CustomPlayer, track: Track | null, payload: TrackStartEvent) {
		await this.trackStartOrchestrator.handleTrackStart(player, track, payload);
	}

	private handleTrackEnd(player: CustomPlayer, track: Track | null, payload: TrackEndEvent) {
		this.queueAdvancer.handleTrackEnd(player, track, payload);
	}

	private async handleTrackStuck(player: CustomPlayer, track: Track | UnresolvedTrack | null, payload: TrackStuckEvent) {
		await this.queueAdvancer.handleTrackStuck(player, track, payload);
	}

	private async handleTrackError(player: CustomPlayer, track: Track | UnresolvedTrack | null, payload: TrackExceptionEvent) {
		await this.queueAdvancer.handleTrackError(player, track, payload);
	}

	private async handleQueueEnd(
		player: CustomPlayer,
		track: Track | UnresolvedTrack | null,
		payload: TrackEndEvent | TrackStuckEvent | TrackExceptionEvent
	) {
		await this.queueAdvancer.handleQueueEnd(player, track, payload);
	}

	private async handlePlayerDestroy(player: CustomPlayer) {
		await this.queueAdvancer.handlePlayerDestroy(player);
	}

	/* ── playbackWatchdog 위임 ── */

	public hasWatchdog(guildId: string): boolean {
		return this.playbackWatchdog.hasWatchdog(guildId);
	}

	public armWatchdog(player: CustomPlayer, serverActiveObserved: number = 0): void {
		this.playbackWatchdog.armWatchdog(player, serverActiveObserved);
	}

	public armWatchdogUnlessStarted(player: CustomPlayer): void {
		this.playbackWatchdog.armWatchdogUnlessStarted(player);
	}

	public clearWatchdog(guildId: string): void {
		this.playbackWatchdog.clearWatchdog(guildId);
	}

	public setLastStarted(player: CustomPlayer, track: Track | null): void {
		this.playbackWatchdog.setLastStarted(player, track);
	}

	public clearReconcile(guildId: string): void {
		this.playbackWatchdog.clearReconcile(guildId);
	}

	public isTransitionAlreadyStarted(player: CustomPlayer, ended: Track | UnresolvedTrack | null): boolean {
		return this.playbackWatchdog.isTransitionAlreadyStarted(player, ended);
	}

	public fetchServerTrack(player: CustomPlayer): Promise<ServerTrackProbe> {
		return this.playbackWatchdog.fetchServerTrack(player);
	}

	/* ── queueAdvancer 위임 ── */

	public startClientOwnedTrack(player: CustomPlayer): Promise<void> {
		return this.queueAdvancer.startClientOwnedTrack(player);
	}

	public finishQueue(player: CustomPlayer): Promise<void> {
		return this.queueAdvancer.finishQueue(player);
	}

	public clearAdvancePending(guildId: string): void {
		this.queueAdvancer.clearAdvancePending(guildId);
	}

	/* ── trackStartOrchestrator 위임 (TTS 이어가기) ── */

	public continueAfterTtsClip(player: CustomPlayer, track: Track | null): Promise<void> {
		return this.trackStartOrchestrator.continueAfterTtsClip(player, track);
	}

	public quietEndTts(player: CustomPlayer): Promise<void> {
		return this.trackStartOrchestrator.quietEndTts(player);
	}

	public cleanup() {
		this.playbackWatchdog.cleanup();
		this.queueAdvancer.cleanup();
		this.lavalinkManager?.removeAllListeners('trackStart');
		this.lavalinkManager?.removeAllListeners('trackEnd');
		this.lavalinkManager?.removeAllListeners('trackStuck');
		this.lavalinkManager?.removeAllListeners('trackError');
		this.lavalinkManager?.removeAllListeners('queueEnd');
		this.lavalinkManager?.removeAllListeners('playerDestroy');
	}
}
