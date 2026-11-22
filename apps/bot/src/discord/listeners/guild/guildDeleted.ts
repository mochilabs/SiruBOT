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

		// 나간 서버의 대기 중 예약 메시지는 지워요 — 다시 들어왔을 때 오래된 공지가 갑자기 나가지 않게요
		if (guild.available !== false) {
			await this.container.scheduledMessages
				?.purgeGuild(guild.id)
				.catch((error: unknown) =>
					this.container.logger.warn(`[scheduled-message] 나간 서버의 예약 정리 실패 (guild ${guild.id}): ${error}`)
				);
		}

		// 진행 중이던 기브어웨이도 마감 작업과 함께 정리해요
		if (guild.available !== false) {
			await this.container.giveaways
				?.purgeGuild(guild.id)
				.catch((error: unknown) => this.container.logger.warn(`[giveaway] 나간 서버의 기브어웨이 정리 실패 (guild ${guild.id}): ${error}`));
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
