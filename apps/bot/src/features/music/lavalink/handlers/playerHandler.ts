import { DestroyReasonsType, LavalinkManager, PlayerJson, RepeatMode } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { CustomPlayer } from '../player/customPlayer.ts';
import { publishPlayerEnded, publishPlayerState } from '../playerStatePublisher.ts';
import type { LavalinkDeps } from '../deps.ts';

export class PlayerHandler extends BaseLavalinkHandler {
	constructor(
		deps: LavalinkDeps,
		private readonly lavalinkManager: LavalinkManager<CustomPlayer>
	) {
		super(deps, 'playerHandler');

		this.lavalinkManager.on('playerCreate', this.wrapAsyncHandler(this.handlePlayerCreate.bind(this), 'playerCreate'));
		this.lavalinkManager.on('playerDestroy', this.wrapAsyncHandler(this.handlePlayerDestroy.bind(this), 'playerDestroy'));
		this.lavalinkManager.on('playerDisconnect', this.handlePlayerDisconnect.bind(this));
		this.lavalinkManager.on('playerMove', this.handlePlayerMove.bind(this));
		this.lavalinkManager.on('playerUpdate', this.wrapAsyncHandler(this.handlePlayerUpdate.bind(this), 'playerUpdate'));
	}

	private async handlePlayerCreate(player: CustomPlayer) {
		this.logger.info(`Player created: ${player.guildId}`);

		this.logger.trace(`Setting volume and repeat mode for player: ${player.guildId}`);
		const guildConfig = await this.deps.guildService.getGuild(player.guildId);
		void player.deleteSponsorBlock().catch(() => null);

		const VALID_REPEAT_MODES = ['off', 'track', 'queue'] as const;
		const repeatMode: RepeatMode = VALID_REPEAT_MODES.includes(guildConfig.repeat as (typeof VALID_REPEAT_MODES)[number])
			? (guildConfig.repeat as RepeatMode)
			: 'off';

		await Promise.all([
			player.setVolume(guildConfig.volume),
			player.setRepeatMode(repeatMode),
			this.deps.redisStore.getPlayerSaver().set(player),
			this.deps.mixerService.pushCrossfadeConfig(player).catch((error) => {
				this.logger.warn(`[mixer] crossfade config push failed (guild ${player.guildId}): ${error}`);
			})
		]);
	}

	private async handlePlayerDestroy(player: CustomPlayer, _reason: DestroyReasonsType | undefined) {
		this.logger.info(`Player destroyed: ${player.guildId}`);
		this.deps.redisStore.getPlayerSaver().delete(player.guildId);
		this.deps.redisStore.getQueueStore().delete(player.guildId);
		this.deps.mixerService.markFiltersStale(player.guildId);
		this.deps.sponsorBlockService.stop(player);
		player.playing = false;
		player.paused = false;
		publishPlayerEnded(this.deps, player);
		await this.deps.playerNotifier.onPlayerDestroy(player);
	}

	private handlePlayerDisconnect(_player: CustomPlayer, _voiceChannelId: string) {
		this.logger.info(`Player disconnected: ${_player.guildId}`);
	}

	private handlePlayerMove(_player: CustomPlayer, _oldChannelId: string, _newChannelId: string) {
		this.logger.info(`Player moved: ${_player.guildId}`);
	}

	private async handlePlayerUpdate(_oldPlayerJson: PlayerJson, newPlayer: CustomPlayer) {
		await Promise.all([this.deps.redisStore.getPlayerSaver().set(newPlayer), this.deps.playerNotifier.onPlayerUpdate(newPlayer)]);
		publishPlayerState(this.deps, newPlayer);

		this.deps.sponsorBlockService.tick(newPlayer);
	}

	public cleanup() {
		this.lavalinkManager?.removeAllListeners('playerCreate');
		this.lavalinkManager?.removeAllListeners('playerDestroy');
		this.lavalinkManager?.removeAllListeners('playerDisconnect');
		this.lavalinkManager?.removeAllListeners('playerMove');
		this.lavalinkManager?.removeAllListeners('playerUpdate');
	}
}
