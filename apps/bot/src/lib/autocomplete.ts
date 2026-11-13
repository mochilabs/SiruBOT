import { container } from '@sapphire/framework';
import type { AutocompleteInteraction } from 'discord.js';

/** 자동완성 선택지 이름 길이 상한 (Discord: 100자) */
const CHOICE_NAME_MAX = 100;
/** 한 번에 내려줄 선택지 수 상한 (Discord: 25개) */
export const CHOICE_LIMIT = 25;

/** 선택지 이름을 Discord 상한에 맞춰 자르고 말줄임표를 붙여요 */
export function clipChoiceName(name: string): string {
	return name.length > CHOICE_NAME_MAX ? `${name.slice(0, CHOICE_NAME_MAX - 1)}…` : name;
}

/**
 * 역할 패널 이름 자동완성 — 해당 길드의 역할 패널만 후보예요.
 * 값은 패널 id 그대로 내려요 (핸들러가 id로 조회해요).
 */
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
