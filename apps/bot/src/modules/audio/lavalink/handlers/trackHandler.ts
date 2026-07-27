import { LavalinkManager, Track, TrackEndEvent, TrackExceptionEvent, TrackStartEvent, TrackStuckEvent, UnresolvedTrack } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { CustomPlayer } from '../player/customPlayer.ts';
import { ContainerBuilder, MessageFlags } from 'discord.js';
import { DEFAULT_COLOR } from '@sirubot/utils';

const MAX_CONSECUTIVE_ERRORS = Number(process.env.MAX_CONSECUTIVE_ERRORS) || 3;

// handlers/trackHandler.ts
export class TrackHandler extends BaseLavalinkHandler {
	constructor(private readonly lavalinkManager: LavalinkManager<CustomPlayer>) {
		super('trackHandler');

		this.lavalinkManager.on('trackStart', this.wrapAsyncHandler(this.handleTrackStart.bind(this), 'trackStart'));
		this.lavalinkManager.on('trackEnd', this.wrapAsyncHandler(this.handleTrackEnd.bind(this), 'trackEnd'));
		this.lavalinkManager.on('trackStuck', this.wrapAsyncHandler(this.handleTrackStuck.bind(this), 'trackStuck'));
		this.lavalinkManager.on('trackError', this.wrapAsyncHandler(this.handleTrackError.bind(this), 'trackError'));
		this.lavalinkManager.on('queueEnd', this.wrapAsyncHandler(this.handleQueueEnd.bind(this), 'queueEnd'));
	}

	private async handleTrackStart(player: CustomPlayer, track: Track | null, _payload: TrackStartEvent) {
		this.logger.info(`Track started: ${track?.info.title} by ${track?.info.author}`);
		player.consecutiveErrors = 0;
		if (track && !track.info.isStream) {
			this.logger.trace(`Ensuring track and increasing plays: ${track.info.title} by ${track.info.author}`);
			// fire-and-forget
			Promise.allSettled([this.container.trackService.increasePlays(track), this.container.trackService.addHistory(player.guildId, track)]);
		}

		await this.container.playerNotifier.onTrackStart(player);
	}

	private handleTrackEnd(_player: CustomPlayer, track: Track | null, _payload: TrackEndEvent) {
		this.logger.info(`Track ended: ${track?.info.title} by ${track?.info.author}`);
	}

	private async handleTrackStuck(player: CustomPlayer, track: Track | null, _payload: TrackStuckEvent) {
		player.consecutiveErrors++;
		this.logger.warn(`Track stuck (${player.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${track?.info.title} by ${track?.info.author}`);

		if (player.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
			this.logger.warn(`Max consecutive errors reached for guild ${player.guildId}, aborting playback`);
			await this.sendNotification(
				player,
				`🚫 연속 재생 오류가 ${MAX_CONSECUTIVE_ERRORS}회 발생했어요. 음성 서버에 문제가 있을 수 있어요. 재생을 중단했어요.`
			);
			player.setData('stopByCommand', true);
			await player.stopPlaying();
			await player.disconnect();
			return;
		}

		await this.sendNotification(player, `❌ **${track?.info.title ?? '알 수 없는 곡'}** 재생 중 오류가 발생했어요. (${player.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`);
		if (player.queue.tracks.length > 0) {
			await player.skip();
		} else {
			await player.stopPlaying();
		}
	}

	private async handleTrackError(player: CustomPlayer, track: Track | null, _payload: TrackExceptionEvent) {
		player.consecutiveErrors++;
		this.logger.warn(`Track error (${player.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${track?.info.title} by ${track?.info.author}`);

		if (player.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
			this.logger.warn(`Max consecutive errors reached for guild ${player.guildId}, aborting playback`);
			await this.sendNotification(
				player,
				`🚫 연속 재생 오류가 ${MAX_CONSECUTIVE_ERRORS}회 발생했어요. 음성 서버에 문제가 있을 수 있어요. 재생을 중단했어요.`
			);
			player.setData('stopByCommand', true);
			await player.stopPlaying();
			await player.disconnect();
			return;
		}

		await this.sendNotification(player, `❌ **${track?.info.title ?? '알 수 없는 곡'}** 재생 중 오류가 발생했어요. (${player.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`);
		if (player.queue.tracks.length > 0) {
			await player.skip();
		} else {
			await player.stopPlaying();
		}
	}

	private async handleQueueEnd(player: CustomPlayer) {
		this.logger.info(`Queue ended for guild: ${player.guildId}`);

		// 대기열의 모든 곡이 끝났으므로 컨트롤러 메시지 삭제
		await this.container.playerNotifier.deleteController(player);

		if (!player.getData('stopByCommand')) {
			await this.sendNotification(player, '📭 대기열의 모든 곡을 재생했어요.');
		}

		return;
	}

	private async sendNotification(player: CustomPlayer, message: string) {
		if (!player.textChannelId) return;
		try {
			const channel = this.container.client.channels.cache.get(player.textChannelId);
			if (channel?.isSendable()) {
				await channel.send({
					components: [
						new ContainerBuilder()
							.setAccentColor(DEFAULT_COLOR)
							.addTextDisplayComponents((textDisplay) => textDisplay.setContent(message))
					],
					flags: [MessageFlags.IsComponentsV2]
				});
			}
		} catch (error) {
			this.logger.error(`Failed to send notification: ${error}`);
		}
	}

	public cleanup() {
		this.lavalinkManager?.removeAllListeners('trackStart');
		this.lavalinkManager?.removeAllListeners('trackEnd');
		this.lavalinkManager?.removeAllListeners('trackStuck');
		this.lavalinkManager?.removeAllListeners('trackError');
		this.lavalinkManager?.removeAllListeners('queueEnd');
	}
}
