import { ApplyOptions } from '@sapphire/decorators';
import { Events, InteractionHandlerError as InteractionHandlerErrorPayload, Listener, UserError } from '@sapphire/framework';
import { MessageFlags, InteractionReplyOptions } from 'discord.js';
import * as Sentry from '@sentry/node';
import { emoji } from '@sirubot/utils';
import { errorView } from '../../../lib/errorView.ts';
import { presentError } from '../../../lib/errorPresenter.ts';

@ApplyOptions<Listener.Options>({ event: Events.InteractionHandlerError })
export class InteractionHandlerError extends Listener {
	public override async run(error: Error, { handler, interaction }: InteractionHandlerErrorPayload) {
		const presentation = presentError(error, `${emoji('tools')} 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.`);

		// UserError 같은 의도된 안내는 Sentry에 적재하지 않아요.
		if (presentation.report) {
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
		} else {
			const label = error instanceof UserError ? `UserError: ${error.identifier}` : String(error.name);
			this.container.logger.warn(`InteractionHandlerError (${label}) in ${handler.name}`);
		}

		if (interaction.isRepliable()) {
			try {
				const { ephemeral, message } = presentation;

				const payload = ephemeral
					? ({
							flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
							components: [errorView(message)]
						} satisfies InteractionReplyOptions)
					: ({
							flags: [MessageFlags.IsComponentsV2],
							components: [errorView(message)]
						} satisfies InteractionReplyOptions);

				if (interaction.replied || interaction.deferred) {
					await interaction.followUp(payload);
				} else {
					await interaction.reply(payload);
				}
			} catch (replyError) {
				this.container.logger.debug(`Failed to send error response to interaction: ${replyError}`);
			}
		}
	}
}
