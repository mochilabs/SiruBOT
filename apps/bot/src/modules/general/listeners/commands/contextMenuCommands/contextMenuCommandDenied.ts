import type { ContextMenuCommandDeniedPayload, Events } from '@sapphire/framework';
import { Listener, UserError } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';

export class UserEvent extends Listener<typeof Events.ContextMenuCommandDenied> {
	public override async run({ message: content }: UserError, { interaction }: ContextMenuCommandDeniedPayload) {
		// 조건 미충족(silent 포함)도 사용자에게 항상 ephemeral로 응답해요 (무응답 방지)
		if (interaction.deferred || interaction.replied) {
			return interaction
				.followUp({
					content,
					allowedMentions: { users: [interaction.user.id], roles: [] },
					flags: MessageFlags.Ephemeral
				})
				.catch(() => undefined);
		}

		return interaction.reply({
			content,
			allowedMentions: { users: [interaction.user.id], roles: [] },
			flags: MessageFlags.Ephemeral
		});
	}
}
