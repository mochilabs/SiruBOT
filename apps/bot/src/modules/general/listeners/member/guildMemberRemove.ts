import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { GuildMember, PartialGuildMember } from 'discord.js';

import { dispatchMemberGreeting } from '../../utils/greetingDispatch.ts';

/**
 * 퇴장 — 작별 인사를 보내요. 떠난 멤버는 캐시에서 사라질 수 있으므로 표시 이름은
 * 이벤트 페이로드에 담긴 값을 그대로 써요.
 * 이벤트 처리 중 문제가 생겨도 이 리스너에서 절대 throw하지 않아요 — 퇴장 처리 흐름을 건드리지 않게요.
 */
@ApplyOptions<Listener.Options>({ event: Events.GuildMemberRemove })
export class GuildMemberRemoveListener extends Listener {
	public override async run(member: GuildMember | PartialGuildMember) {
		await dispatchMemberGreeting(member.guild, 'goodbye', member);
	}
}
