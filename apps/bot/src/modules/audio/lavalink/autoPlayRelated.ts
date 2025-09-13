import { Scraper } from '@sirubot/yt-related-scraper';
import { container } from '@sapphire/framework';
import { Player, Track } from 'lavalink-client';

const relatedScraper = new Scraper({
	log: container.logger,
	timeout: 10000
});

export const autoPlayRelated = async (player: Player, lastPlayedTrack: Track): Promise<void> => {
	if (player.repeatMode == 'off') {
		if (lastPlayedTrack.info.identifier) {
			const relatedTracks = await relatedScraper.scrape(lastPlayedTrack.info.identifier ?? '');
			if (relatedTracks) {
				const searchResult = await player.node.search('https://youtu.be/' + relatedTracks[relatedTracks.length - 1].videoId, 'related_track');
				container.logger.debug(`[autoPlayRelated] Search result: ${JSON.stringify(searchResult)}`);
				if (searchResult.loadType != 'error' && searchResult.loadType != 'empty') {
					player.queue.add(searchResult.tracks[0]);
				}
			}
		}
	}
};
