import { DestroyReasonsType, LavalinkManager, Player, RepeatMode } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';

// TODO: 안쓰는거 정리, ts-ignore 제거
// handlers/playerHandler.ts
export class PlayerHandler extends BaseLavalinkHandler {
	private lavalinkManager: LavalinkManager | null;
	constructor() {
		super();
		this.lavalinkManager = null;
	}

	public setup(lavalinkManager: LavalinkManager) {
		this.lavalinkManager = lavalinkManager;
		lavalinkManager.on('playerCreate', this.wrapAsyncHandler(this.handlePlayerCreate.bind(this), 'playerCreate'));
		lavalinkManager.on('playerDestroy', this.handlePlayerDestroy.bind(this));
		lavalinkManager.on('playerDisconnect', this.handlePlayerDisconnect.bind(this));
		lavalinkManager.on('playerMove', this.handlePlayerMove.bind(this));
		lavalinkManager.on('playerUpdate', this.wrapAsyncHandler(this.handlePlayerUpdate.bind(this), 'playerUpdate'));
	}

	private async handlePlayerCreate(player: Player) {
		this.logger.info(`Player created: ${player.guildId}`);

		this.logger.trace(`Setting volume and repeat mode for player: ${player.guildId}`);
		const guildConfig = await this.container.guildService.getGuild(player.guildId);
		await player.setVolume(guildConfig.volume);
		await player.setRepeatMode(guildConfig.repeat as RepeatMode);

		this.container.redisStoreManager.getPlayerSaver().set(player);
	}
	//@ts-ignore
	private handlePlayerDestroy(player: Player, reason: DestroyReasonsType | undefined) {
		this.logger.info(`Player destroyed: ${player.guildId}`);
		this.container.redisStoreManager.getPlayerSaver().delete(player.guildId);
	}
	//@ts-ignore
	private handlePlayerDisconnect(player: Player, voiceChannelId: string) {
		this.logger.info(`Player disconnected: ${player.guildId}`);
	}
	//@ts-ignore
	private handlePlayerMove(player: Player, oldChannelId: string, newChannelId: string) {
		this.logger.info(`Player moved: ${player.guildId}`);
	}

	//@ts-ignore
	private async handlePlayerUpdate(oldPlayerJson: PlayerJson, newPlayer: Player) {
		this.logger.trace(`Player updated: ${newPlayer.guildId}`);
		await this.container.redisStoreManager.getPlayerSaver().set(newPlayer);
	}

	public cleanup() {
		this.lavalinkManager?.off('playerCreate', this.handlePlayerCreate.bind(this));
		this.lavalinkManager?.off('playerDestroy', this.handlePlayerDestroy.bind(this));
		this.lavalinkManager?.off('playerDisconnect', this.handlePlayerDisconnect.bind(this));
		this.lavalinkManager?.off('playerMove', this.handlePlayerMove.bind(this));
	}
}
