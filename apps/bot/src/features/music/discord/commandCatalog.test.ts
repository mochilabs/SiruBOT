import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MUSIC_PROMOTED_COMMANDS, MUSIC_SUBCOMMAND_CATALOG, MUSIC_SUBCOMMANDS } from './commandCatalog.ts';

const SUBCOMMANDS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'subcommands');

/** 카탈로그 항목이 실제 서브커맨드 모듈의 메타데이터와 같은지 확인해요 (카탈로그가 어긋나면 /도움말이 틀려요) */
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
