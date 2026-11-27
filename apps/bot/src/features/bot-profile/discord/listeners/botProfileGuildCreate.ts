import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Guild } from 'discord.js';

import { container } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({ event: Events.GuildCreate })
export class BotProfileGuildCreateListener extends Listener {
	public override run(guild: Guild) {
		container.botProfileService.publishGuildProfileFromGuild(guild);
	}
}
