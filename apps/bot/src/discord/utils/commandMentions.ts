import { container } from '@sapphire/framework';
import type { ApplicationCommand } from 'discord.js';

const INDEX_TTL_MS = 10 * 60_000;
const indexCache = new Map<string, { at: number; commands: Map<string, ApplicationCommand> }>();

export async function fetchCommandIndex(guildId?: string | null): Promise<Map<string, ApplicationCommand>> {
	const key = guildId ?? '';
	const cached = indexCache.get(key);
	if (cached && Date.now() - cached.at < INDEX_TTL_MS) return cached.commands;

	try {
		const application = container.client.application;
		if (!application) return cached?.commands ?? new Map();

		const map = new Map<string, ApplicationCommand>();
		const globalCommands = await application.commands.fetch();
		globalCommands.forEach((command) => map.set(command.name, command));

		if (guildId) {
			const guild = await container.client.guilds.fetch(guildId).catch(() => null);
			const guildCommands = await guild?.commands.fetch().catch(() => null);
			guildCommands?.forEach((command) => map.set(command.name, command));
		}

		indexCache.set(key, { at: Date.now(), commands: map });
		return map;
	} catch (error) {
		container.logger.warn(`[commandMentions] failed to fetch command index: ${error}`);
		return cached?.commands ?? new Map();
	}
}
