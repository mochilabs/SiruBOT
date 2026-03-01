import { container } from '@sapphire/framework';
import { DEFAULT_COLOR } from '@sirubot/utils';
import { ContainerBuilder, MessageFlags } from 'discord.js';
import { Player, Track } from 'lavalink-client';

export const autoPlayRelated = async (player: Player, lastPlayedTrack: Track): Promise<void> => {
	const relatedOn = await container.guildService.getRelated(player.guildId);
	if (player.repeatMode == 'off' && relatedOn) {
		if (lastPlayedTrack.info.identifier && lastPlayedTrack.info.sourceName == 'youtube') {
			const RD_PLAYLIST_ID = 'RD' + lastPlayedTrack.info.identifier;

			try {
				const searchResult = await player.node.search('https://youtube.com/playlist?list=' + RD_PLAYLIST_ID, {
					id: 'related_track',
					username: null
				});
				container.logger.debug(`Search result: ${JSON.stringify(searchResult)}`);

				if (searchResult.loadType !== 'error' && searchResult.loadType !== 'empty') {
					const previous = [...player.queue.previous.map((e) => e.info.identifier)];
					if (player.queue.current) previous.push(player.queue.current.info.identifier);

					const uniqueTracks = searchResult.tracks.filter((track) => !previous.includes(track.info.identifier));

					if (uniqueTracks.length > 0) {
						const randomTrack = uniqueTracks[Math.floor(Math.random() * uniqueTracks.length)];
						player.queue.add(randomTrack);
						return;
					}

					container.logger.debug(`No unique related tracks found for: ${lastPlayedTrack.info.identifier}`);
				} else {
					container.logger.debug(`Related search failed (${searchResult.loadType}): ${lastPlayedTrack.info.identifier}`);
				}
			} catch (error) {
				container.logger.error(`Error fetching related tracks: ${error}`);
			}

			// 추천곡을 찾지 못한 경우: 재생 종료 + 알림
			await sendEndNotification(player, '📭 추천 곡을 찾지 못해 재생을 종료했어요.');
		}
	}
};

async function sendEndNotification(player: Player, message: string) {
	if (!player.textChannelId) return;
	try {
		const channel = await container.client.channels.fetch(player.textChannelId);
		if (channel?.isSendable()) {
			await channel.send({
				components: [
					new ContainerBuilder().setAccentColor(DEFAULT_COLOR).addTextDisplayComponents((textDisplay) => textDisplay.setContent(message))
				],
				flags: [MessageFlags.IsComponentsV2]
			});
		}
	} catch (error) {
		container.logger.error(`Failed to send autoplay notification: ${error}`);
	}
}
