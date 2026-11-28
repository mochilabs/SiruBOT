import { LavalinkManager, Track, TrackEndEvent, TrackExceptionEvent, TrackStartEvent, TrackStuckEvent, UnresolvedTrack } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { CustomPlayer } from '../player/customPlayer.ts';
import { PlaybackWatchdog, ServerTrackProbe } from './playbackWatchdog.ts';
import { QueueAdvancer } from './queueAdvancer.ts';
import { TrackStartOrchestrator } from './trackStartOrchestrator.ts';
import type { LavalinkDeps } from '../deps.ts';

export interface TrackTransitionHost {
	hasWatchdog(guildId: string): boolean;
	armWatchdog(player: CustomPlayer, serverActiveObserved?: number): void;
	armWatchdogUnlessStarted(player: CustomPlayer): void;
	clearWatchdog(guildId: string): void;
	setLastStarted(player: CustomPlayer, track: Track | null): void;
	clearReconcile(guildId: string): void;
	isTransitionAlreadyStarted(player: CustomPlayer, ended: Track | UnresolvedTrack | null): boolean;
	fetchServerTrack(player: CustomPlayer): Promise<ServerTrackProbe>;
	startClientOwnedTrack(player: CustomPlayer): Promise<void>;
	finishQueue(player: CustomPlayer): Promise<void>;
	clearAdvancePending(guildId: string): void;
	continueAfterTtsClip(player: CustomPlayer, track: Track | null): Promise<void>;
	quietEndTts(player: CustomPlayer): Promise<void>;
}

export class TrackHandler extends BaseLavalinkHandler implements TrackTransitionHost {
	private readonly playbackWatchdog: PlaybackWatchdog;
	private readonly queueAdvancer: QueueAdvancer;
	private readonly trackStartOrchestrator: TrackStartOrchestrator;

	constructor(
		deps: LavalinkDeps,
		private readonly lavalinkManager: LavalinkManager<CustomPlayer>
	) {
		super(deps, 'trackHandler');

		this.playbackWatchdog = new PlaybackWatchdog(this, this.logger, lavalinkManager, deps);
		this.queueAdvancer = new QueueAdvancer(this, this.logger, lavalinkManager, deps);
		this.trackStartOrchestrator = new TrackStartOrchestrator(this, this.logger, lavalinkManager, deps);

		this.lavalinkManager.on('trackStart', this.wrapAsyncHandler(this.handleTrackStart.bind(this), 'trackStart'));
		this.lavalinkManager.on('trackEnd', this.wrapAsyncHandler(this.handleTrackEnd.bind(this), 'trackEnd'));
		this.lavalinkManager.on('trackStuck', this.wrapAsyncHandler(this.handleTrackStuck.bind(this), 'trackStuck'));
		this.lavalinkManager.on('trackError', this.wrapAsyncHandler(this.handleTrackError.bind(this), 'trackError'));
		this.lavalinkManager.on('queueEnd', this.wrapAsyncHandler(this.handleQueueEnd.bind(this), 'queueEnd'));
		this.lavalinkManager.on('playerDestroy', this.wrapAsyncHandler(this.handlePlayerDestroy.bind(this), 'playerDestroy'));
	}

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

	public startClientOwnedTrack(player: CustomPlayer): Promise<void> {
		return this.queueAdvancer.startClientOwnedTrack(player);
	}

	public finishQueue(player: CustomPlayer): Promise<void> {
		return this.queueAdvancer.finishQueue(player);
	}

	public clearAdvancePending(guildId: string): void {
		this.queueAdvancer.clearAdvancePending(guildId);
	}

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
