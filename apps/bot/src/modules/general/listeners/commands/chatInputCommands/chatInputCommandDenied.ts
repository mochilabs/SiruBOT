import { ApplyOptions } from '@sapphire/decorators';
import { ChatInputCommandDeniedPayload, Events } from '@sapphire/framework';
import { Listener, UserError } from '@sapphire/framework';
import { DEFAULT_COLOR } from '@sirubot/utils';
import { ChatInputCommandInteraction, ContainerBuilder, MessageFlags } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandDenied })
export class ChatInputCommandDenied extends Listener {
	public override async run({ context, message: content }: UserError, { interaction }: ChatInputCommandDeniedPayload) {
		// `context: { silent: true }` should make UserError silent:
		// Use cases for this are for example permissions error when running the `eval` command.
		if (Reflect.get(Object(context), 'silent')) return;

		await sendComponent(
			interaction,
			new ContainerBuilder().setAccentColor(DEFAULT_COLOR).addTextDisplayComponents((textDisplay) => textDisplay.setContent(content))
		);
	}
}

export async function sendComponent(interaction: ChatInputCommandInteraction, component: ContainerBuilder) {
	if (interaction.deferred || interaction.replied) {
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
		flags: [MessageFlags.IsComponentsV2]
	});
}
