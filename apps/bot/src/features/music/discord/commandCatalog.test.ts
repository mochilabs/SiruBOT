import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MUSIC_PROMOTED_COMMANDS, MUSIC_SUBCOMMAND_CATALOG, MUSIC_SUBCOMMANDS } from './commandCatalog.ts';

const SUBCOMMANDS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'subcommands');

describe('music command catalog', () => {
	it('matches every subcommand module', async () => {
		const files = readdirSync(SUBCOMMANDS_DIR).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
		const modules = await Promise.all(files.map((file) => import(path.join(SUBCOMMANDS_DIR, file)) as Promise<Record<string, unknown>>));
		const actual = modules
			.map((mod) => ({
				name: mod.name as string,
				ko: mod.ko as string,
				description: mod.description as string,
				descriptionEn: (mod.descriptionEn ?? mod.description) as string
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
		const expected = [...MUSIC_SUBCOMMAND_CATALOG].sort((a, b) => a.name.localeCompare(b.name));
		expect(expected).toEqual(actual);
	});

	it('splits promoted commands out of the subcommand list', () => {
		expect(MUSIC_PROMOTED_COMMANDS.map((sub) => sub.name)).toEqual(['play', 'skip', 'stop']);
		expect(MUSIC_SUBCOMMANDS.some((sub) => ['play', 'skip', 'stop'].includes(sub.name))).toBe(false);
		expect(MUSIC_SUBCOMMANDS).toHaveLength(MUSIC_SUBCOMMAND_CATALOG.length - 3);
	});
});
