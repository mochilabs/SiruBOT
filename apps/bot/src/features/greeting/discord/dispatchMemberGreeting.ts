import { container } from '@sapphire/framework';
import type { GreetingKind } from '@sirubot/utils';
import type { Guild, GuildMember, PartialGuildMember } from 'discord.js';
import { isMessageFeatureEnabled } from '../../../services/guildSettings/modules.ts';
import type { GreetingMemberInfo } from '../application/memberGreetingService.ts';

const KIND_LABELS: Record<GreetingKind, string> = { welcome: '환영', goodbye: '작별' };

export async function dispatchMemberGreeting(guild: Guild, kind: GreetingKind, member: GuildMember | PartialGuildMember): Promise<void> {
	if (!(await isMessageFeatureEnabled(container.guildService, guild.id, 'greeting').catch(() => true))) return;
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
