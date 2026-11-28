import { container } from '@sapphire/framework';
import { memberGreetingSendEvent } from '@sirubot/utils';
import { createRedisEventListener, type RedisBinding } from '../../../lib/redisResponder.ts';

export function createMemberGreetingSendListener(): RedisBinding {
	return createRedisEventListener(memberGreetingSendEvent, async ({ event }) => {
		await container.memberGreetingService.applyForGuild(event.guildId, event.requestId ?? null);
	});
}
