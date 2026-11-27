import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { GuildMember, PartialGuildMember } from 'discord.js';

import { dispatchMemberGreeting } from '../dispatchMemberGreeting.ts';

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberRemove })
export class GuildMemberRemoveListener extends Listener {
	public override async run(member: GuildMember | PartialGuildMember) {
		await dispatchMemberGreeting(member.guild, 'goodbye', member);
	}
}
