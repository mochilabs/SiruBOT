import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, InteractionHandlerError as InteractionHandlerErrorPayload } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import * as Sentry from '@sentry/node';
import { errorView } from '../../audio/view/error.ts';

@ApplyOptions<Listener.Options>({ event: Events.InteractionHandlerError })
export class InteractionHandlerError extends Listener {
	public override async run(error: Error, { handler, interaction }: InteractionHandlerErrorPayload) {
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

		// 사용자에게 에러 메시지 전달
		if (interaction.isRepliable()) {
			try {
				const payload = {
					flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
					components: [errorView('🛠️ 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.')]
				} as const;

				if (interaction.replied || interaction.deferred) {
					await interaction.followUp(payload);
				} else {
					await interaction.reply(payload);
				}
			} catch {
				// 응답 실패는 무시 (이미 시간 초과 등)
			}
		}
	}
}
