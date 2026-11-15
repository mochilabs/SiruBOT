import { LavalinkManager } from 'lavalink-client';
import { NodeHandler } from './nodeHandler.ts';
import { PlayerHandler } from './playerHandler.ts';
import { TrackHandler } from './trackHandler.ts';
import { CustomPlayer } from '../player/customPlayer.ts';
import type { LavalinkDeps } from '../deps.ts';

// lavalinkHandlerManager.ts
export class LavalinkHandler {
	private nodeHandler: NodeHandler;
	private playerHandler: PlayerHandler;
	private trackHandler: TrackHandler;

	constructor(lavalinkManager: LavalinkManager<CustomPlayer>, deps: LavalinkDeps) {
		this.nodeHandler = new NodeHandler(deps, lavalinkManager.nodeManager);
		this.playerHandler = new PlayerHandler(deps, lavalinkManager);
		this.trackHandler = new TrackHandler(deps, lavalinkManager);
	}

	public cleanup() {
		this.nodeHandler.cleanup();
		this.playerHandler.cleanup();
		this.trackHandler.cleanup();
	}
}
