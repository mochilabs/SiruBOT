import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Guild } from 'discord.js';

@ApplyOptions<Listener.Options>({
	event: Events.GuildDelete
})
export class GuildDeleteListener extends Listener {
	public override async run(guild: Guild) {
		this.container.logger.info('guild.lifecycle.deleted', { guild_name: guild.name, guild_id: guild.id });

		// Stop and destroy audio player if it exists
		if (this.container.audio) {
			const player = this.container.audio.getPlayer(guild.id);
			if (player) {
				this.container.logger.debug('guild.lifecycle.destroying_player', { guild_id: guild.id });
				player.setData('stopByCommand', true);
				try {
					await player.destroy();
				} catch (error) {
					this.container.logger.error('guild.lifecycle.destroy_player_failed', { guild_id: guild.id, error });
				}
			}
		}
	}
}
