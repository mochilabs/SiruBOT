import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Guild } from 'discord.js';
import { sendWelcome } from '../../onboarding/sendWelcome.ts';

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
