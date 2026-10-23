import { container } from '@sapphire/framework';
import type { GreetingKind } from '@sirubot/utils';
import type { Guild, GuildMember, PartialGuildMember } from 'discord.js';
import type { GreetingMemberInfo } from '../../../services/memberGreetingService.ts';

const KIND_LABELS: Record<GreetingKind, string> = { welcome: '환영', goodbye: '작별' };

/** 입퇴장 인사 dispatch: 실패는 여기서 잡아 로그로만 남기고 입·퇴장 처리 흐름으로 새지 않아요 */
export async function dispatchMemberGreeting(guild: Guild, kind: GreetingKind, member: GuildMember | PartialGuildMember): Promise<void> {
	const payload: GreetingMemberInfo = {
		user: { id: member.id, username: member.user?.username ?? member.displayName },
		displayName: member.displayName,
		mention: member.toString(),
		avatarUrl: member.displayAvatarURL({ size: 256, extension: 'png' })
	};
	try {
		await container.memberGreetingService.dispatch(guild, kind, payload);
	} catch (error) {
		container.logger.warn(`${KIND_LABELS[kind]} 인사 처리 실패 (guild ${guild.id}): ${error}`);
	}
}
