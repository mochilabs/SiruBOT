import { container } from '@sapphire/framework';
import { botProfileRefreshEvent, botProfileSetEvent } from '@sirubot/utils';
import { createRedisEventListener, type RedisBinding } from '../../../lib/redisResponder.ts';

export function createBotProfileListeners(): RedisBinding[] {
	return [
		createRedisEventListener(botProfileSetEvent, async ({ event }) => {
			await container.botProfileService.applyForGuild(event.guildId);
		}),
		createRedisEventListener(botProfileRefreshEvent, async ({ event }) => {
			await container.botProfileService.refreshForGuild(event.guildId);
		})
	];
}
