import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Guild } from 'discord.js';

@ApplyOptions<Listener.Options>({
	event: Events.GuildDelete
})
export class GuildDeleteListener extends Listener {
	public override async run(guild: Guild) {
		this.container.logger.info(`Bot removed from guild: ${guild.name} (${guild.id})`);

		// 장애로 잠시 안 보이는 서버(available=false)는 나간 게 아니에요. 다시 들어오면 짧은 안내가 가요 (GuildLifecycle).
		if (guild.available !== false) {
			await this.container.guildLifecycle
				?.recordLeave(guild.id)
				.catch((error: unknown) => this.container.logger.warn(`[onboarding] 나간 기록 실패 (guild ${guild.id}): ${error}`));
		}

		if (this.container.audio) {
			const player = this.container.audio.getPlayer(guild.id);
			if (player) {
				this.container.logger.debug(`Destroying audio player for deleted guild: ${guild.id}`);
				player.transitionState.stopByCommand = true;
				try {
					await player.destroy();
				} catch (error) {
					this.container.logger.error(`Failed to destroy player for guild ${guild.id}:`, error);
				}
			}
		}
	}
}
