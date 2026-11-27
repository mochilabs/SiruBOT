import { container } from '@sapphire/framework';
import { guildSettingsInvalidateEvent } from '@sirubot/utils';
import { needsUpcomingTrack } from '@sirubot/utils/mixerTransition';
import { createRedisEventListener, type RedisBinding } from '../../../lib/redisResponder.ts';
import type { RedisLogger } from '../../../lib/redisPublisher.ts';
import * as guildMixer from '../../../services/guildSettings/mixer.ts';

async function applyMixerToPlayer(guildId: string, logger: RedisLogger): Promise<void> {
	try {
		const player = container.audio.getPlayer(guildId);
		if (!player) return;
		const settings = await guildMixer.getMixerSettings(container.guildService, guildId);
		await container.mixerService.pushCrossfadeConfig(player);
		if (needsUpcomingTrack(settings)) {
			await container.mixerService.preloadUpcoming(player, { force: true }).catch(() => null);
		} else {
			await container.mixerService.clearNext(player, { force: true }).catch(() => null);
		}
		logger.debug(`믹서 설정을 재생 중 플레이어에 적용: ${guildId}`);
	} catch (error) {
		logger.warn(`믹서 라이브 적용 실패 (guild ${guildId}): ${error instanceof Error ? error.message : String(error)}`);
	}
}

export function createGuildSettingsInvalidationListener(): RedisBinding {
	return createRedisEventListener(guildSettingsInvalidateEvent, ({ event, logger }) => {
		const { guildId } = event;
		// 무효화 전에 이전 채널을 읽어야 패널 이동 여부를 알 수 있어요
		const previousTextChannelId = container.guildService.peekCached(guildId)?.textChannelId ?? null;
		container.guildService.invalidate(guildId);
		container.starboardService.invalidateSettings(guildId);
		container.customCommandStore.clearGuildCustomCommandsCache(guildId);
		void container.customSlashRegistry.syncGuildSlashCommands(guildId, logger);
		logger.debug(`길드 설정 캐시 무효화: ${guildId}`);
		if (event.reason === 'mixer') void applyMixerToPlayer(guildId, logger);
		if (event.reason === 'panel' && container.client.guilds.cache.has(guildId)) {
			void container.lavalink.playerNotifier.syncPanel(guildId, previousTextChannelId);
		}
	});
}
