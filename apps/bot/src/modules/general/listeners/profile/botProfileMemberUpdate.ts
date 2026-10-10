import { ApplyOptions } from '@sapphire/decorators';
import { container } from '@sapphire/framework';
import { Events, Listener } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';

import { botProfileService } from '../../../../services/botProfileService.ts';

/**
 * 봇 자신의 길드 멤버가 바뀌면(닉네임·아바타) 봇 프로필 상태를 다시 퍼블리시해요.
 * 대시보드 밖에서(관리자가 직접) 닉네임을 바꿔도 패널이 정확한 값을 따라가요.
 */
@ApplyOptions<Listener.Options>({ event: Events.GuildMemberUpdate })
export class BotProfileMemberUpdateListener extends Listener {
	public override run(_oldMember: GuildMember | null, newMember: GuildMember) {
		const botUserId = container.client.user?.id;
		if (!botUserId || newMember.id !== botUserId) return;

		botProfileService.publishGuildProfileFromGuild(newMember.guild);
	}
}
