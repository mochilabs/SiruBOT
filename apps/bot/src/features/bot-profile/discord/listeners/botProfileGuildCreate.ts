import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Guild } from 'discord.js';

import { container } from '@sapphire/framework';

/** 새 길드 진입 — 봇 프로필 상태를 바로 퍼블리시해요 (패널이 초기값을 받아요). */
@ApplyOptions<Listener.Options>({ event: Events.GuildCreate })
export class BotProfileGuildCreateListener extends Listener {
	public override run(guild: Guild) {
		container.botProfileService.publishGuildProfileFromGuild(guild);
	}
}
