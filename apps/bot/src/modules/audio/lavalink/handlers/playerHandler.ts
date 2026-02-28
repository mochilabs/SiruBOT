import { DestroyReasonsType, LavalinkManager, RepeatMode, SponsorBlockSegment } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { CustomPlayer } from '../player/customPlayer.ts';

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

		this.logger.trace(`Setting volume and repeat mode for player: ${player.guildId}`);
		const guildConfig = await this.container.guildService.getGuild(player.guildId);

		// SponsorBlock 조건부 활성화
		if (guildConfig.sponsorBlockSegments.length > 0) {
			player.setSponsorBlock(guildConfig.sponsorBlockSegments as SponsorBlockSegment[]);
		}

		await Promise.all([
			player.setVolume(guildConfig.volume),
			player.setRepeatMode(guildConfig.repeat as RepeatMode),
			this.container.redisStore.getPlayerSaver().set(player)
		]);
	}

	private async handlePlayerDestroy(player: CustomPlayer, _reason: DestroyReasonsType | undefined) {
		this.logger.info(`Player destroyed: ${player.guildId}`);
		this.container.redisStore.getPlayerSaver().delete(player.guildId);
		await this.container.playerNotifier.onPlayerDestroy(player);
	}

	private handlePlayerDisconnect(_player: CustomPlayer, _voiceChannelId: string) {
		this.logger.info(`Player disconnected: ${_player.guildId}`);
	}

	private handlePlayerMove(_player: CustomPlayer, _oldChannelId: string, _newChannelId: string) {
		this.logger.info(`Player moved: ${_player.guildId}`);
	}

	private async handlePlayerUpdate(_oldPlayerJson: any, newPlayer: CustomPlayer) {
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
