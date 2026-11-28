import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';

import { container } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({ event: Events.ClientReady })
export class BotProfileReadyListener extends Listener {
	public override run() {
		const guilds = [...this.container.client.guilds.cache.values()];
		for (const guild of guilds) {
			container.botProfileService.publishGuildProfileFromGuild(guild);
		}
		this.container.logger.debug(`봇 프로필 상태 초기 퍼블리시: ${guilds.length}개 길드`);
	}
}
