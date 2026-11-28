import { container } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction } from 'discord.js';
import { settingsView } from './views/settings.ts';

export async function openSettingsPanel(
	interaction: ChatInputCommandInteraction<'cached'> | ButtonInteraction<'cached'>,
	options: { ephemeral: boolean }
): Promise<void> {
	await interaction.deferReply(options.ephemeral ? { flags: MessageFlags.Ephemeral } : undefined);
	const guild = await container.guildService.getGuild(interaction.guildId);
	await interaction.editReply({
		components: [settingsView(guild, 'main')],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { roles: [], users: [] }
	});
}
