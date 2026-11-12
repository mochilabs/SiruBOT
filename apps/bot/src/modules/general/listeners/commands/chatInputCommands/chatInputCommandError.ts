import { ApplyOptions } from '@sapphire/decorators';
import { ChatInputCommandErrorPayload, Events } from '@sapphire/framework';
import { Listener } from '@sapphire/framework';
import { emoji, DEFAULT_COLOR, WARN_COLOR } from '@sirubot/utils';
import { notice } from '../../../../../lib/notice.ts';
import { sendComponent } from './chatInputCommandDenied.ts';
import { presentError } from '../../../../../lib/errorPresenter.ts';
import * as Sentry from '@sentry/node';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandError })
export class ChatInputCommandError extends Listener {
	public override async run(error: Error, { interaction, command }: ChatInputCommandErrorPayload) {
		const presentation = presentError(error, `${emoji('tools')} 명령어를 실행하는 도중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.`);

		if (presentation.report) {
			Sentry.withScope((scope) => {
				scope.setUser({ id: interaction.user.id });
				scope.setTag('command', command.name);
				scope.setTag('type', 'chatInputCommandError');
				if (interaction.guild) {
					scope.setTag('guild_id', interaction.guild.id);
					scope.setContext('guild', {
						id: interaction.guild.id
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

		await sendComponent(interaction, notice(presentation.message, presentation.report ? WARN_COLOR : DEFAULT_COLOR), {
			ephemeral: presentation.ephemeral
		});
	}
}
