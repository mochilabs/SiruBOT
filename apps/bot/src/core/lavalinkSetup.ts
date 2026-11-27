import { container } from '@sapphire/framework';
import { parseLavalinkHosts } from '@sirubot/utils';
import { LavalinkHandler } from '../features/music/index.ts';
import type { BotApplication } from './botApplication.ts';
import { getConfig } from '../lib/config.ts';

export const setupLavalink = async (client: BotApplication<boolean>, shardIds: number[] | 'auto', shardCount: number): Promise<void> => {
	client.logger.debug('Setting up lavalink...');
	const { lavalink } = getConfig();
	const { hosts: lavalinkHosts, defaultPasswordUsed } = parseLavalinkHosts(lavalink.hosts, lavalink.defaultPassword);
	if (defaultPasswordUsed) {
		client.logger.warn(
			'Some LAVALINK_HOSTS entries have no password; using the default "youshallnotpass". Set the node password explicitly or provide LAVALINK_DEFAULT_PASSWORD.'
		);
	}
	await client.setupAudio(lavalinkHosts, { shardIds: Array.isArray(shardIds) ? shardIds : [0], shardCount });

	container.lavalinkHandler = new LavalinkHandler(container.audio, container.lavalink);
	await container.audio.init({ id: client.user!.id });
};
