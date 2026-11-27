import { UserError } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import type { ChatInputCommandInteraction } from 'discord.js';

export function musicMemberPreconditionError(interaction: ChatInputCommandInteraction): UserError | null {
	if (interaction.inCachedGuild()) return null;
	return new UserError({
		identifier: 'music_not_in_guild',
		message: `${emoji('error')} 길드 안에서만 사용할 수 있어요.`,
		context: { ephemeral: true }
	});
}
