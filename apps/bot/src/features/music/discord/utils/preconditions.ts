import { UserError } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import type { ChatInputCommandInteraction } from 'discord.js';

/**
 * 음악 계열 커맨드의 길드 전용 안내 — `/음악`과 승격 커맨드(`/재생`, `/건너뛰기`)가 같은 문구를 써요.
 * 캐시된 길드가 아니면 null을 돌려주고, 호출부는 그대로 진행해도 돼요(전제조건이 다시 막아요).
 */
export function musicMemberPreconditionError(interaction: ChatInputCommandInteraction): UserError | null {
	if (interaction.inCachedGuild()) return null;
	return new UserError({
		identifier: 'music_not_in_guild',
		message: `${emoji('error')} 길드 안에서만 사용할 수 있어요.`,
		context: { ephemeral: true }
	});
}
