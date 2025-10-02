import { container } from '@sapphire/framework';
import { DEFAULT_COLOR } from '@sirubot/utils';
import { ContainerBuilder, MessageFlags } from 'discord.js';
import { Player, Track } from 'lavalink-client';

export const autoPlayRelated = async (player: Player, lastPlayedTrack: Track): Promise<void> => {
	const relatedOn = await container.guildService.getRelated(player.guildId);
	if (player.repeatMode == 'off' && relatedOn) {
		if (lastPlayedTrack.info.identifier && lastPlayedTrack.info.sourceName == 'youtube') {
			const RD_PLAYLIST_ID = 'RD' + lastPlayedTrack.info.identifier;
			const searchResult = await player.node.search('https://youtube.com/playlist?list=' + RD_PLAYLIST_ID, {
				id: 'related_track',
				username: null
			});
			container.logger.debug(`Search result: ${JSON.stringify(searchResult)}`);
			if (searchResult.loadType != 'error' && searchResult.loadType != 'empty') {
				const previous = [...player.queue.previous.map((e) => e.info.identifier)];
				if (player.queue.current) previous.push(player.queue.current.info.identifier);

				const uniqueTracks = searchResult.tracks.filter((track) => !previous.includes(track.info.identifier));
				const randomTrack = uniqueTracks[Math.floor(Math.random() * uniqueTracks.length)];

				player.queue.add(randomTrack);
			} else {
				// TODO: Temporary error handling
				container.logger.debug(`Search result is error or empty: ${JSON.stringify(searchResult)}`);
				if (player.textChannelId) {
					container.client.channels.fetch(player.textChannelId).then((channel) => {
						channel?.isSendable() &&
							channel?.send({
								components: [
									new ContainerBuilder()
										.setAccentColor(DEFAULT_COLOR)
										.addTextDisplayComponents((textDisplay) =>
											textDisplay.setContent(':x: 재생 중인 노래의 추천 곡을 찾지 못했어요.')
										)
								],
								flags: [MessageFlags.IsComponentsV2]
							});
					});
				}
			}
		}
	}
};
