import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Guild } from 'discord.js';

@ApplyOptions<Listener.Options>({
	event: Events.GuildDelete
})
export class GuildDeleteListener extends Listener {
	public override async run(guild: Guild) {
		this.container.logger.info(`Bot removed from guild: ${guild.name} (${guild.id})`);

		// available=false는 일시 장애이므로 실제 탈퇴로 기록하지 않아요.
		if (guild.available !== false) {
			await this.container.guildLifecycle
				?.recordLeave(guild.id)
				.catch((error: unknown) => this.container.logger.warn(`[onboarding] 나간 기록 실패 (guild ${guild.id}): ${error}`));
		}

		if (guild.available !== false) {
			await this.container.scheduledMessages
				?.purgeGuild(guild.id)
				.catch((error: unknown) =>
					this.container.logger.warn(`[scheduled-message] 나간 서버의 예약 정리 실패 (guild ${guild.id}): ${error}`)
				);
		}

		if (guild.available !== false) {
			await this.container.birthday
				?.purgeGuild(guild.id)
				.catch((error: unknown) => this.container.logger.warn(`[birthday] 나간 서버의 작업 정리 실패 (guild ${guild.id}): ${error}`));
		}

		if (guild.available !== false) {
			await this.container.giveaways
				?.purgeGuild(guild.id)
				.catch((error: unknown) => this.container.logger.warn(`[giveaway] 나간 서버의 나눔 정리 실패 (guild ${guild.id}): ${error}`));
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
