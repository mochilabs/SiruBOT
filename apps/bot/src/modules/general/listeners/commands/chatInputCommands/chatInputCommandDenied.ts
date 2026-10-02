import { ApplyOptions } from '@sapphire/decorators';
import { ChatInputCommandDeniedPayload, Events } from '@sapphire/framework';
import { Listener, UserError } from '@sapphire/framework';
import { DEFAULT_COLOR } from '@sirubot/utils';
import { ChatInputCommandInteraction, ContainerBuilder, MessageFlags } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandDenied })
export class ChatInputCommandDenied extends Listener {
	public override async run({ message: content }: UserError, { interaction }: ChatInputCommandDeniedPayload) {
		// 조건 미충족(silent 포함)도 사용자에게 항상 ephemeral로 응답해요.
		// 무응답이면 디스코드가 "애플리케이션이 응답하지 않음"을 띄워요.
		await sendComponent(
			interaction,
			new ContainerBuilder().setAccentColor(DEFAULT_COLOR).addTextDisplayComponents((textDisplay) => textDisplay.setContent(content)),
			{ ephemeral: true }
		);
	}
}

export async function sendComponent(
	interaction: ChatInputCommandInteraction,
	component: ContainerBuilder,
	options: { ephemeral: boolean } = { ephemeral: false }
) {
	if (interaction.deferred || interaction.replied) {
		// defer 후 ephemeral 요청은 editReply로는 지울 수 없으니 followUp으로 보내요
		if (options.ephemeral) {
			await interaction
				.followUp({
					components: [component],
					flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
					allowedMentions: { users: [interaction.user.id], roles: [] }
				})
				.catch(() => undefined);
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
