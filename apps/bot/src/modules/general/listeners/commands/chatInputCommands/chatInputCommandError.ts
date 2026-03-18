import { ApplyOptions } from '@sapphire/decorators';
import { ChatInputCommandErrorPayload, Events } from '@sapphire/framework';
import { Listener, UserError } from '@sapphire/framework';
import { DEFAULT_COLOR, WARN_COLOR } from '@sirubot/utils';
import { ContainerBuilder } from 'discord.js';
import { sendComponent } from './chatInputCommandDenied.ts';
import * as Sentry from '@sentry/node';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandError })
export class ChatInputCommandError extends Listener {
	public override async run(error: Error, { interaction, command }: ChatInputCommandErrorPayload) {
		const userError = error instanceof UserError;

		// send actual error to sentry
		if (!userError) {
			Sentry.withScope((scope) => {
				scope.setUser({ id: interaction.user.id });
				scope.setTag('command', command.name);
				scope.setTag('type', 'chatInputCommandError');
				if (interaction.guild) {
					scope.setTag('guild_id', interaction.guild.id);
					scope.setContext('guild', {
						id: interaction.guild.id,
					});
				}
				scope.setContext('interaction', {
					commandName: interaction.commandName,
					channelId: interaction.channelId,
					options: interaction.options.data.map((opt) => ({ name: opt.name, value: opt.value }))
				});
				Sentry.captureException(error);
			});
		}

		await sendComponent(
			interaction,
			new ContainerBuilder()
				.setAccentColor(userError ? DEFAULT_COLOR : WARN_COLOR)
				.addTextDisplayComponents((textDisplay) =>
					textDisplay.setContent(!userError ? '명령어를 실행하는 도중 오류가 발생했어요\n' + error.message : error.message)
				)
		);
	}
}
