import { ApplyOptions } from '@sapphire/decorators';
import { ContextMenuCommandErrorPayload, Events, Listener, UserError } from '@sapphire/framework';
import * as Sentry from '@sentry/node';

@ApplyOptions<Listener.Options>({ event: Events.ContextMenuCommandError })
export class ContextMenuCommandError extends Listener {
	public override run(error: Error, { interaction, command }: ContextMenuCommandErrorPayload) {
		if (error instanceof UserError) return;

		Sentry.withScope((scope) => {
			scope.setUser({ id: interaction.user.id });
			scope.setTag('command', command.name);
			scope.setTag('type', 'contextMenuCommandError');
			if (interaction.guild) {
				scope.setTag('guild_id', interaction.guild.id);
				scope.setContext('guild', {
					id: interaction.guild.id,
				});
			}
			Sentry.captureException(error);
		});

		this.container.logger.error(`ContextMenuCommandError in ${command.name}:`, error);
	}
}
