import { ApplyOptions } from '@sapphire/decorators';
import { ContextMenuCommandErrorPayload, Events, Listener, UserError } from '@sapphire/framework';
import { InteractionReplyOptions, MessageFlags } from 'discord.js';
import * as Sentry from '@sentry/node';
import { appEmoji } from '@sirubot/utils';
import { errorView } from '../../../../audio/view/error.ts';

@ApplyOptions<Listener.Options>({ event: Events.ContextMenuCommandError })
export class ContextMenuCommandError extends Listener {
	public override async run(error: Error, { interaction, command }: ContextMenuCommandErrorPayload) {
		const userError = error instanceof UserError;

		// UserError는 의도된 사용자 안내이므로 Sentry에 적재하지 않아요.
		if (!userError) {
			Sentry.withScope((scope) => {
				scope.setUser({ id: interaction.user.id });
				scope.setTag('command', command.name);
				scope.setTag('type', 'contextMenuCommandError');
				if (interaction.guild) {
					scope.setTag('guild_id', interaction.guild.id);
					scope.setContext('guild', {
						id: interaction.guild.id
					});
				}
				Sentry.captureException(error);
			});

			this.container.logger.error(`ContextMenuCommandError in ${command.name}:`, error);
		} else {
			this.container.logger.warn(`ContextMenuCommandError (UserError) in ${command.name}: ${error.identifier}`);
		}

		// 무응답이면 디스코드가 "애플리케이션이 응답하지 않음"을 띄우므로 항상 응답해요.
		if (interaction.isRepliable()) {
			try {
				const context = userError ? error.context : undefined;
				const ephemeral = typeof context === 'object' && context !== null && 'ephemeral' in context ? Boolean(context.ephemeral) : !userError;
				const message = userError
					? error.message
					: `${appEmoji('tools', '🛠️')} 명령어를 실행하는 도중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.`;

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
