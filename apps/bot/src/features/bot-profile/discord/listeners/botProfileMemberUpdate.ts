import { ApplyOptions } from '@sapphire/decorators';
import { container } from '@sapphire/framework';
import { Events, Listener } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberUpdate })
export class BotProfileMemberUpdateListener extends Listener {
	public override run(_oldMember: GuildMember | null, newMember: GuildMember) {
		const botUserId = container.client.user?.id;
		if (!botUserId || newMember.id !== botUserId) return;

		container.botProfileService.publishGuildProfileFromGuild(newMember.guild);
	}
}
