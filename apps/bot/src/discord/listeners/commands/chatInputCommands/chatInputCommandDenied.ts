import { ApplyOptions } from '@sapphire/decorators';
import { ChatInputCommandDeniedPayload, Events } from '@sapphire/framework';
import { Listener, UserError, container } from '@sapphire/framework';
import { notice } from '../../../../lib/notice.ts';
import { ChatInputCommandInteraction, ContainerBuilder, MessageFlags, RESTJSONErrorCodes } from 'discord.js';
import { ignoreDiscord } from '../../../../lib/ignoreDiscord.ts';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandDenied })
export class ChatInputCommandDenied extends Listener {
	public override async run({ message: content }: UserError, { interaction }: ChatInputCommandDeniedPayload) {
		await sendComponent(interaction, notice(content), { ephemeral: true });
	}
}

export async function sendComponent(
	interaction: ChatInputCommandInteraction,
	component: ContainerBuilder,
	options: { ephemeral: boolean } = { ephemeral: false }
) {
	if (interaction.deferred || interaction.replied) {
		// 공개 defer 후 ephemeral 응답 시, followUp 전에 @original을 먼저 지워야 followUp이 @original을 채운 뒤 삭제되는 문제를 피해요.
		if (options.ephemeral) {
			if (interaction.ephemeral) {
				await ignoreDiscord(
					interaction.editReply({
						components: [component],
						flags: [MessageFlags.IsComponentsV2],
						allowedMentions: { users: [interaction.user.id], roles: [] }
					}),
					[RESTJSONErrorCodes.UnknownMessage, RESTJSONErrorCodes.UnknownInteraction]
				);
				return;
			}

			await interaction.deleteReply().catch((error: unknown) => {
				container.logger.warn(`[command-error] placeholder deleteReply failed (user ${interaction.user.id}): ${String(error)}`);
				return undefined;
			});
			await interaction
				.followUp({
					components: [component],
					flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
					allowedMentions: { users: [interaction.user.id], roles: [] }
				})
				.catch((error: unknown) => {
					container.logger.warn(`[command-error] ephemeral followUp failed (user ${interaction.user.id}): ${String(error)}`);
					return undefined;
				});
			return;
		}

		await interaction.editReply({
			components: [component],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [interaction.user.id], roles: [] }
		});

		return;
	}

	await interaction.reply({
		components: [component],
		allowedMentions: { users: [interaction.user.id], roles: [] },
		flags: options.ephemeral ? [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] : [MessageFlags.IsComponentsV2]
	});
}
