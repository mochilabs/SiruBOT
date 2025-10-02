import { DestroyReasonsType, LavalinkManager, LyricsLineEvent, RepeatMode, Track, UnresolvedTrack } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { CustomPlayer } from '../player/customPlayer.ts';

// TODO: 안쓰는거 정리, ts-ignore 제거
// handlers/playerHandler.ts
export class PlayerHandler extends BaseLavalinkHandler {
	constructor(private readonly lavalinkManager: LavalinkManager<CustomPlayer>) {
		super('playerHandler');

		this.lavalinkManager.on('playerCreate', this.wrapAsyncHandler(this.handlePlayerCreate.bind(this), 'playerCreate'));
		this.lavalinkManager.on('playerDestroy', this.wrapAsyncHandler(this.handlePlayerDestroy.bind(this), 'playerDestroy'));
		this.lavalinkManager.on('playerDisconnect', this.handlePlayerDisconnect.bind(this));
		this.lavalinkManager.on('playerMove', this.handlePlayerMove.bind(this));
		this.lavalinkManager.on('playerUpdate', this.wrapAsyncHandler(this.handlePlayerUpdate.bind(this), 'playerUpdate'));
	}

	private async handlePlayerCreate(player: CustomPlayer) {
		this.logger.info(`Player created: ${player.guildId}`);
		// Experimental
		// player.setSponsorBlock(['sponsor', 'selfpromo', 'interaction', 'outro', 'preview', 'filler', 'music_offtopic']);

		this.logger.trace(`Setting volume and repeat mode for player: ${player.guildId}`);
		const guildConfig = await this.container.guildService.getGuild(player.guildId);

		await Promise.all([
			player.setVolume(guildConfig.volume),
			player.setRepeatMode(guildConfig.repeat as RepeatMode),
			this.container.redisStore.getPlayerSaver().set(player)
		]);
	}
	//@ts-ignore
	private async handlePlayerDestroy(player: CustomPlayer, reason: DestroyReasonsType | undefined) {
		this.logger.info(`Player destroyed: ${player.guildId}`);
		this.container.redisStore.getPlayerSaver().delete(player.guildId);
		await this.container.playerNotifier.onPlayerDestroy(player);
	}
	//@ts-ignore
	private handlePlayerDisconnect(player: CustomPlayer, voiceChannelId: string) {
		this.logger.info(`Player disconnected: ${player.guildId}`);
	}
	//@ts-ignore
	private handlePlayerMove(player: CustomPlayer, oldChannelId: string, newChannelId: string) {
		this.logger.info(`Player moved: ${player.guildId}`);
	}

	//@ts-ignore
	private async handlePlayerUpdate(oldPlayerJson: PlayerJson, newPlayer: CustomPlayer) {
		this.logger.info(`Player updated: ${newPlayer.guildId}`);
		await this.container.redisStore.getPlayerSaver().set(newPlayer);
		await this.container.playerNotifier.onPlayerUpdate(newPlayer);
	}

	public cleanup() {
		this.lavalinkManager?.removeAllListeners('playerCreate');
		this.lavalinkManager?.removeAllListeners('playerDestroy');
		this.lavalinkManager?.removeAllListeners('playerDisconnect');
		this.lavalinkManager?.removeAllListeners('playerMove');
		this.lavalinkManager?.removeAllListeners('playerUpdate');
	}
}
