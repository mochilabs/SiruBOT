import { DestroyReasonsType, LavalinkManager, PlayerJson, RepeatMode, SponsorBlockSegment } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { CustomPlayer } from '../player/customPlayer.ts';
import { publishPlayerState } from '../playerStatePublisher.ts';

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
		const VALID_SPONSORBLOCK_SEGMENTS: SponsorBlockSegment[] = [
			'sponsor',
			'selfpromo',
			'interaction',
			'intro',
			'outro',
			'preview',
			'music_offtopic',
			'filler'
		];
		if (guildConfig.sponsorBlockSegments.length > 0) {
			const validSegments = guildConfig.sponsorBlockSegments.filter((s): s is SponsorBlockSegment =>
				VALID_SPONSORBLOCK_SEGMENTS.includes(s as SponsorBlockSegment)
			);
			if (validSegments.length > 0) {
				player.setSponsorBlock(validSegments);
			}
		}

		const VALID_REPEAT_MODES = ['off', 'track', 'queue'] as const;
		const repeatMode: RepeatMode = VALID_REPEAT_MODES.includes(guildConfig.repeat as (typeof VALID_REPEAT_MODES)[number])
			? (guildConfig.repeat as RepeatMode)
			: 'off';

		await Promise.all([
			player.setVolume(guildConfig.volume),
			player.setRepeatMode(repeatMode),
			this.container.redisStore.getPlayerSaver().set(player),
			// mixer 필터 자체는 play 이전에 primeForPlay가 보낸다(트랙 시작 시 체인을 만드는 시점이
			// play이므로 그 뒤의 필터 op는 현재 트랙에 반영되지 않는다). 여기서는 crossfade 설정만 밀어둔다.
			this.container.mixerService.pushCrossfadeConfig(player).catch((error) => {
				this.logger.warn(`[mixer] crossfade config push failed (guild ${player.guildId}): ${error}`);
			})
		]);
	}

	private async handlePlayerDestroy(player: CustomPlayer, _reason: DestroyReasonsType | undefined) {
		this.logger.info(`Player destroyed: ${player.guildId}`);
		this.container.redisStore.getPlayerSaver().delete(player.guildId);
		// 큐 키도 함께 삭제 — TTL(7일)이 있어도 정상 종료 시에는 즉시 정리해 Redis 키 누수를 막는다.
		this.container.redisStore.getQueueStore().delete(player.guildId);
		// 파괴된 플레이어의 서버 필터 상태도 사라진다 — 다음 play 전에 다시 prime해야 한다.
		this.container.mixerService.markFiltersStale(player.guildId);
		// 파괴된 플레이어는 재생 중이 아니다 — 마지막 프레임이 '재생 중'으로 남아 대시보드가
		// 유령 상태를 보이지 않게(stale 창 60초) 정지로 마킹하고 보낸다.
		player.playing = false;
		player.paused = false;
		// 대시보드 라이브 뷰 — 소멸 직후 마지막 상태를 한 번 더 퍼블리시 (fire-and-forget)
		publishPlayerState(player);
		await this.container.playerNotifier.onPlayerDestroy(player);
	}

	private handlePlayerDisconnect(_player: CustomPlayer, _voiceChannelId: string) {
		this.logger.info(`Player disconnected: ${_player.guildId}`);
	}

	private handlePlayerMove(_player: CustomPlayer, _oldChannelId: string, _newChannelId: string) {
		this.logger.info(`Player moved: ${_player.guildId}`);
	}

	private async handlePlayerUpdate(_oldPlayerJson: PlayerJson, newPlayer: CustomPlayer) {
		await Promise.all([this.container.redisStore.getPlayerSaver().set(newPlayer), this.container.playerNotifier.onPlayerUpdate(newPlayer)]);
		// 대시보드 라이브 뷰 — playerUpdate는 볼륨/seek/큐 변경까지 커버해요 (fire-and-forget)
		publishPlayerState(newPlayer);
	}

	public cleanup() {
		this.lavalinkManager?.removeAllListeners('playerCreate');
		this.lavalinkManager?.removeAllListeners('playerDestroy');
		this.lavalinkManager?.removeAllListeners('playerDisconnect');
		this.lavalinkManager?.removeAllListeners('playerMove');
		this.lavalinkManager?.removeAllListeners('playerUpdate');
	}
}
