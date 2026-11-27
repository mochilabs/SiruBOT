import { container } from '@sapphire/framework';
import type { AutocompleteInteraction } from 'discord.js';

const CHOICE_NAME_MAX = 100;
export const CHOICE_LIMIT = 25;

export function clipChoiceName(name: string): string {
	return name.length > CHOICE_NAME_MAX ? `${name.slice(0, CHOICE_NAME_MAX - 1)}…` : name;
}

export async function respondRolePanelNames(interaction: AutocompleteInteraction): Promise<void> {
	if (!interaction.inCachedGuild()) return interaction.respond([]);

	const typed = interaction.options.getFocused().trim().toLowerCase();
	const panels = await container.rolePanelService.getPanels(interaction.guildId).catch(() => []);

	await interaction.respond(
		panels
			.filter((panel) => panel.name.toLowerCase().includes(typed))
			.slice(0, CHOICE_LIMIT)
			.map((panel) => ({
				name: clipChoiceName(panel.name),
				value: panel.id
			}))
	);
}
