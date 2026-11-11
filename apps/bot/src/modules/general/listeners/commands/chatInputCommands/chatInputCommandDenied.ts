import { ApplyOptions } from '@sapphire/decorators';
import { ChatInputCommandDeniedPayload, Events } from '@sapphire/framework';
import { Listener, UserError, container } from '@sapphire/framework';
import { notice } from '../../../view/notice.ts';
import { ChatInputCommandInteraction, ContainerBuilder, MessageFlags, RESTJSONErrorCodes } from 'discord.js';
import { ignoreDiscord } from '../../../../../lib/ignoreDiscord.ts';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandDenied })
export class ChatInputCommandDenied extends Listener {
	public override async run({ message: content }: UserError, { interaction }: ChatInputCommandDeniedPayload) {
		// 조건 미충족(silent 포함)도 사용자에게 항상 ephemeral로 응답해요.
		// 무응답이면 디스코드가 "애플리케이션이 응답하지 않음"을 띄워요.
		await sendComponent(interaction, notice(content), { ephemeral: true });
	}
}

export async function sendComponent(
	interaction: ChatInputCommandInteraction,
	component: ContainerBuilder,
	options: { ephemeral: boolean } = { ephemeral: false }
) {
	if (interaction.deferred || interaction.replied) {
		// defer 후 ephemeral 요청:
		// - 이미 ephemeral로 defer된 경우: editReply로 그대로 수정 가능해요
		// - 공개 defer된 경우: followUp을 먼저 호출하면 Discord가 첫 followUp으로 @original을 채운 뒤 deleteReply가 그 에러 메시지 자체를 지워버리므로, 반드시 @original(생각 중 자리표시자)을 먼저 삭제한 뒤 ephemeral followUp을 보내요
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
