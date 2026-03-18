import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, InteractionHandlerError as InteractionHandlerErrorPayload } from '@sapphire/framework';
import * as Sentry from '@sentry/node';

@ApplyOptions<Listener.Options>({ event: Events.InteractionHandlerError })
export class InteractionHandlerError extends Listener {
	public override run(error: Error, { handler, interaction }: InteractionHandlerErrorPayload) {
		Sentry.withScope((scope) => {
			scope.setTag('handler', handler.name);
			scope.setTag('type', 'interactionHandlerError');
			if (interaction.isRepliable() && interaction.guild) {
				scope.setTag('guild_id', interaction.guild.id);
				scope.setUser({ id: interaction.user.id, username: interaction.user.username });
			}
			Sentry.captureException(error);
		});

		this.container.logger.error(`InteractionHandlerError in ${handler.name}:`, error);
	}
}
