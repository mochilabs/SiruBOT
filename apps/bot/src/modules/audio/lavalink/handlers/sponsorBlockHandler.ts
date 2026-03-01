import { LavalinkManager, SponsorBlockChaptersLoaded, SponsorBlockSegmentSkipped, Track, UnresolvedTrack } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';
import { CustomPlayer } from '../player/customPlayer.ts';
import { ContainerBuilder, MessageFlags } from 'discord.js';
import { DEFAULT_COLOR } from '@sirubot/utils';

export class SponsorBlockHandler extends BaseLavalinkHandler {
	constructor(private readonly lavalinkManager: LavalinkManager<CustomPlayer>) {
		super('sponsorBlockHandler');

		this.lavalinkManager.on('ChaptersLoaded', this.wrapAsyncHandler(this.handleChaptersLoaded.bind(this), 'ChaptersLoaded'));
		this.lavalinkManager.on('SegmentSkipped', this.wrapAsyncHandler(this.handleSponsorBlock.bind(this), 'SegmentSkipped'));
	}

	private async handleChaptersLoaded(player: CustomPlayer, _track: Track | UnresolvedTrack | null, payload: SponsorBlockChaptersLoaded) {
		this.logger.debug(`Chapters loaded: ${player.guildId} ${payload.chapters.length}`);
		player.chapters = payload.chapters;
	}

	private async handleSponsorBlock(player: CustomPlayer, _track: Track | UnresolvedTrack | null, payload: SponsorBlockSegmentSkipped) {
		this.logger.info(`Sponsor block: ${player.guildId} ${payload.segment.category} ${payload.segment.start}`);
		const segments: Record<string, string> = {
			sponsor: '프로모션',
			selfpromo: '자사 홍보',
			interaction: '상호 작용 요청',
			intro: '인트로',
			outro: '아웃트로',
			preview: '미리보기',
			music_offtopic: '음악이 아닌',
			filler: '빈'
		};

		if (!player.textChannelId) return;
		const channel = this.container.client.channels.cache.get(player.textChannelId);
		if (channel?.isSendable()) {
			await channel
				.send({
					components: [
						new ContainerBuilder()
							.setAccentColor(DEFAULT_COLOR)
							.addTextDisplayComponents((textDisplay) =>
								textDisplay.setContent(
									`⏩ [SponsorBlock] **${segments[payload.segment.category] ?? payload.segment.category}** 구간을 건너뛰었어요.`
								)
							)
					],
					flags: [MessageFlags.IsComponentsV2]
				})
				.then((m) => setTimeout(() => m.delete().catch(() => {}), 3000));
		}
	}

	public cleanup() {
		this.lavalinkManager.removeAllListeners('ChaptersLoaded');
		this.lavalinkManager.removeAllListeners('SegmentSkipped');
	}
}
