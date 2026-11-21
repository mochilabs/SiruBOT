import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Guild } from 'discord.js';
import { sendWelcome } from '../../onboarding/sendWelcome.ts';

/**
 * 서버 가입 안내 (P-02). discord.js는 처음 연결 때 받은 서버에는 GuildCreate를 보내지 않고, 장애 복구는 GuildAvailable로 보내요.
 * 그래도 샤드 재연결 등으로 같은 서버가 또 올 수 있어서 GuildLifecycle 조건부 쓰기로 안내를 한 번만 보내요.
 */
@ApplyOptions<Listener.Options>({ event: Events.GuildCreate })
export class GuildCreateListener extends Listener {
	public override async run(guild: Guild) {
		this.container.logger.info(`Bot added to guild: ${guild.name} (${guild.id})`);
		try {
			const kind = await this.container.guildLifecycle.recordJoin(guild.id, guild.joinedAt ?? null);
			if (kind === 'skip') return;
			if (await sendWelcome(guild, kind)) await this.container.guildLifecycle.markOnboarded(guild.id);
		} catch (error) {
			this.container.logger.warn(`[onboarding] 가입 처리 실패 (guild ${guild.id}): ${error}`);
		}
	}
}
