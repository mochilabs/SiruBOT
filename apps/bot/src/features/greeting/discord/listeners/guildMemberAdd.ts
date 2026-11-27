import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { GuildMember } from 'discord.js';

import { dispatchMemberGreeting } from '../dispatchMemberGreeting.ts';

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberAdd })
export class GuildMemberAddListener extends Listener {
	public override async run(member: GuildMember) {
		await dispatchMemberGreeting(member.guild, 'welcome', member);
	}
}
