import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { GuildMember } from 'discord.js';

import { dispatchMemberGreeting } from '../../utils/greetingDispatch.ts';

/**
 * 입장 — 환영 인사를 보내요. 설정은 GuildService 캐시(Guild.welcome)에서 읽어요.
 * 이벤트 처리 중 문제가 생겨도 이 리스너에서 절대 throw하지 않아요 — 입장 처리 흐름을 건드리지 않게요.
 */
@ApplyOptions<Listener.Options>({ event: Events.GuildMemberAdd })
export class GuildMemberAddListener extends Listener {
	public override async run(member: GuildMember) {
		await dispatchMemberGreeting(member.guild, 'welcome', member);
	}
}
