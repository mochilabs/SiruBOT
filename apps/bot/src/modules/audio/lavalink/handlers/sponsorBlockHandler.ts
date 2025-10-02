import { LavalinkManager, Player, SponsorBlockChapterStarted, SponsorBlockSegmentSkipped, Track, UnresolvedTrack } from 'lavalink-client';
import { BaseLavalinkHandler } from './base.ts';

export class SponsorBlockHandler extends BaseLavalinkHandler {
	constructor(private readonly lavalinkManager: LavalinkManager) {
		super('sponsorBlockHandler');

		this.lavalinkManager.on('SegmentSkipped', this.wrapAsyncHandler(this.handleSponsorBlock.bind(this), 'SponsorBlock'));
		this.lavalinkManager.on('ChapterStarted', this.wrapAsyncHandler(this.handleChaptersLoaded.bind(this), 'ChaptersLoaded'));
	}

	private async handleChaptersLoaded(player: Player, track: Track | UnresolvedTrack | null, payload: SponsorBlockChapterStarted) {
		this.logger.info(`Chapter started: ${player.guildId} ${payload.chapter.name} ${payload.chapter.start}`);

		if (!player.textChannelId) return;
		const channel = this.container.client.channels.cache.get(player.textChannelId);
		if (channel && channel.isSendable()) {
			channel.send(`${payload.chapter.name} ${payload.chapter.start}`);
		}
	}

	private async handleSponsorBlock(player: Player, track: Track | UnresolvedTrack | null, payload: SponsorBlockSegmentSkipped) {
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
		if (channel && channel.isSendable()) {
			channel.send(`[SponsorBlock] ${segments[payload.segment.category]} 부분을 건너뛰었어요.`);
		}
	}

	public cleanup() {
		this.lavalinkManager.removeAllListeners('ChapterStarted');
	}
}
