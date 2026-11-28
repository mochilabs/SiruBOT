import { container } from '@sapphire/framework';
import { withGuildTheme } from './guildTheme.ts';

export function inGuildTheme<T>(guildId: string | null | undefined, fn: () => Promise<T> | T): Promise<T> {
	return withGuildTheme(guildId, async (id) => (await container.guildService.getGuild(id)).themePreset, fn);
}

export function inFreshGuildTheme<T>(guildId: string | null | undefined, fn: () => Promise<T> | T): Promise<T> {
	return withGuildTheme(guildId, async (id) => (await container.guildService.getGuild(id)).themePreset, fn, { fresh: true });
}
