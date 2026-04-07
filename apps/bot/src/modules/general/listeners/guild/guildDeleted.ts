import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Guild } from 'discord.js';

@ApplyOptions<Listener.Options>({
	event: Events.GuildDelete
})
export class GuildDeleteListener extends Listener {
	public override async run(guild: Guild) {
		this.container.logger.info(`Bot removed from guild: ${guild.name} (${guild.id})`);

		// Stop and destroy audio player if it exists
		if (this.container.audio) {
			const player = this.container.audio.getPlayer(guild.id);
			if (player) {
				this.container.logger.debug(`Destroying audio player for deleted guild: ${guild.id}`);
				player.setData('stopByCommand', true);
				await player.destroy();
			}
		}
	}
}
