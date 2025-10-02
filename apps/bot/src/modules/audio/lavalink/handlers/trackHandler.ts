import {
	LavalinkManager,
	Player,
	Track,
	TrackEndEvent,
	TrackExceptionEvent,
	TrackStartEvent,
	TrackStuckEvent,
	UnresolvedTrack
} from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';

// TODO: 안쓰는거 정리, ts-ignore 제거
// handlers/trackHandler.ts
export class TrackHandler extends BaseLavalinkHandler {
	constructor(private readonly lavalinkManager: LavalinkManager) {
		super('trackHandler');

		this.lavalinkManager.on('trackStart', this.wrapAsyncHandler(this.handleTrackStart.bind(this), 'trackStart'));
		this.lavalinkManager.on('trackEnd', this.wrapAsyncHandler(this.handleTrackEnd.bind(this), 'trackEnd'));
		this.lavalinkManager.on('trackStuck', this.wrapAsyncHandler(this.handleTrackStuck.bind(this), 'trackStuck'));
		this.lavalinkManager.on('trackError', this.wrapAsyncHandler(this.handleTrackError.bind(this), 'trackError'));
		this.lavalinkManager.on('queueEnd', this.wrapAsyncHandler(this.handleQueueEnd.bind(this), 'queueEnd'));
	}

	//@ts-ignore
	private async handleTrackStart(player: Player, track: Track | null, payload: TrackStartEvent) {
		this.logger.info(`Track started: ${track?.info.title} by ${track?.info.author}`);
		if (track && !track.info.isStream) {
			this.logger.trace(`Ensuring track and increasing plays: ${track.info.title} by ${track.info.author}`);
			await this.container.trackService.increasePlays(track);
		}

		this.container.playerNotifier.onTrackStart(player);
	}

	//@ts-ignore
	private handleTrackEnd(player: Player, track: Track | null, payload: TrackEndEvent) {
		this.logger.info(`Track ended: ${track?.info.title} by ${track?.info.author}`);
	}

	//@ts-ignore
	private handleTrackStuck(player: Player, track: Track | null, payload: TrackStuckEvent) {
		this.logger.info(`Track stuck: ${track?.info.title} by ${track?.info.author}`);
	}

	//@ts-ignore
	private handleTrackError(player: Player, track: Track | UnresolvedTrack | null, payload: TrackExceptionEvent) {
		this.logger.info(`Track error: ${track?.info.title} by ${track?.info.author}`);
	}

	//@ts-ignore
	private async handleQueueEnd(player: Player) {
		this.logger.info(`Queue ended`);
	}

	public cleanup() {
		this.lavalinkManager?.removeAllListeners('trackStart');
		this.lavalinkManager?.removeAllListeners('trackEnd');
		this.lavalinkManager?.removeAllListeners('trackStuck');
		this.lavalinkManager?.removeAllListeners('trackError');
		this.lavalinkManager?.removeAllListeners('queueEnd');
	}
}
