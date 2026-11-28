import { ApplyOptions } from '@sapphire/decorators';
import { ChatInputCommandErrorPayload, Events, UserError } from '@sapphire/framework';
import { Listener } from '@sapphire/framework';
import { emoji, WARN_COLOR } from '@sirubot/utils';
import { notice } from '../../../../lib/notice.ts';
import { unexpectedErrorView } from '../../../../lib/unexpectedErrorView.ts';
import { sendComponent } from './chatInputCommandDenied.ts';
import { presentError } from '../../../../lib/errorPresenter.ts';
import * as Sentry from '@sentry/node';

// Sapphire 기본 CoreChatInputCommandError를 같은 이름으로 대체해요. 기본 리스너는 UserError("가사를 찾을 수 없어요" 같은 안내)까지
// 스택과 함께 ERROR로 남겨서, 예상한 안내는 warn 한 줄로, 예상 못 한 오류만 error로 남겨요.
@ApplyOptions<Listener.Options>({ name: 'CoreChatInputCommandError', event: Events.ChatInputCommandError })
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
			this.container.logger.error(`ChatInputCommandError in ${command.name}:`, error);
		} else {
			const label = error instanceof UserError ? `UserError: ${error.identifier}` : String(error.name);
			this.container.logger.warn(`ChatInputCommandError (${label}) in ${command.name}`);
		}

		const view = presentation.showSupport
			? await unexpectedErrorView(presentation.message, { accentColor: WARN_COLOR })
			: notice(presentation.message, presentation.report ? WARN_COLOR : undefined);
		await sendComponent(interaction, view, {
			ephemeral: presentation.ephemeral
		});
	}
}
