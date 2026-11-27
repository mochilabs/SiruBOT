import type { ApplicationCommand } from 'discord.js';

export function commandMention(name: string, index: ReadonlyMap<string, ApplicationCommand>): string {
	const command = index.get(name);
	return command ? `</${name}:${command.id}>` : `\`/${name}\``;
}
