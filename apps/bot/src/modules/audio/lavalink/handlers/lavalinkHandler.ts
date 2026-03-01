import { LavalinkManager } from 'lavalink-client';
import { NodeHandler } from './nodeHandler.ts';
import { PlayerHandler } from './playerHandler.ts';
import { TrackHandler } from './trackHandler.ts';
import { SponsorBlockHandler } from './sponsorBlockHandler.ts';
import { CustomPlayer } from '../player/customPlayer.ts';

// lavalinkHandlerManager.ts
export class LavalinkHandler {
	private nodeHandler: NodeHandler;
	private playerHandler: PlayerHandler;
	private trackHandler: TrackHandler;
	private sponsorBlockHandler: SponsorBlockHandler;

	constructor(lavalinkManager: LavalinkManager<CustomPlayer>) {
		this.nodeHandler = new NodeHandler(lavalinkManager.nodeManager);
		this.playerHandler = new PlayerHandler(lavalinkManager);
		this.trackHandler = new TrackHandler(lavalinkManager);
		this.sponsorBlockHandler = new SponsorBlockHandler(lavalinkManager);
	}

	public cleanup() {
		this.nodeHandler.cleanup();
		this.playerHandler.cleanup();
		this.trackHandler.cleanup();
		this.sponsorBlockHandler.cleanup();
	}
}
