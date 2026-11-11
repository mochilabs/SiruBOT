import { container } from '@sapphire/framework';
import { parseLavalinkHosts } from '@sirubot/utils';
import { LavalinkHandler } from '../modules/audio/lavalink/handlers/lavalinkHandler.ts';
import type { BotApplication } from './botApplication.ts';
import { getConfig } from './config.ts';

/** LAVALINK_HOSTS 파싱 → setupAudio → 핸들러 등록 → 노드 연결. (로그인 이후에 호출해요) */
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

	// Lavalink 핸들러 등록 및 노드 연결 (setupAudio 직후, 순서 보장)
	container.lavalinkHandler = new LavalinkHandler(container.audio);
	await container.audio.init({ id: client.user!.id });
};
