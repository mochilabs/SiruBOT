import { ApplyOptions } from '@sapphire/decorators';
import { ChatInputCommandDeniedPayload, Events } from '@sapphire/framework';
import { Listener, UserError } from '@sapphire/framework';
import { DEFAULT_COLOR } from '@sirubot/utils';
import { ChatInputCommandInteraction, ContainerBuilder, MessageFlags } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandDenied })
export class ChatInputCommandDenied extends Listener {
	public override async run({ message: content, context }: UserError, { interaction }: ChatInputCommandDeniedPayload) {
		if (typeof context === 'object' && context !== null && 'silent' in context && context.silent) return;

		await sendComponent(
			interaction,
			new ContainerBuilder().setAccentColor(DEFAULT_COLOR).addTextDisplayComponents((textDisplay) => textDisplay.setContent(content)),
			{ ephemeral: typeof context === 'object' && context !== null && 'ephemeral' in context && (context.ephemeral as boolean) }
		);
	}
}

export async function sendComponent(
	interaction: ChatInputCommandInteraction,
	component: ContainerBuilder,
	options: { ephemeral: boolean } = { ephemeral: false }
) {
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
		flags: options.ephemeral ? [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] : [MessageFlags.IsComponentsV2]
	});
}
