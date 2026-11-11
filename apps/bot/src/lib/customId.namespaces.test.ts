import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { registeredCustomIdNamespaces } from './customId.ts';
// 선언 파일을 모두 불러와 registry를 채워요. 새 선언 파일을 만들면 여기에도 추가해요(아래 스캔 테스트가 빠뜨림을 잡아요).
import '../modules/audio/customIds.ts';
import '../modules/audio/utils/queueViewId.ts';
import '../modules/general/customIds.ts';
import './confirmationId.ts';
import '../features/tickets/discord/customIds.ts';
import '../features/role-panels/discord/customIds.ts';
import '../features/games/discord/customIds.ts';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(full);
		return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
	});
}

describe('customId namespaces', () => {
	it('every declared namespace is unique', () => {
		const namespaces = registeredCustomIdNamespaces();
		expect(new Set(namespaces).size).toBe(namespaces.length);
	});

	it('no defineCustomId call site is missing from the registry', () => {
		const declared = sourceFiles(SRC_ROOT)
			.filter((file) => !file.endsWith(path.join('lib', 'customId.ts')))
			.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/defineCustomId\(\{\s*namespace:\s*'([^']+)'/g)].map((match) => match[1]!));
		expect(declared.toSorted()).toEqual(registeredCustomIdNamespaces().toSorted());
		expect(new Set(declared).size).toBe(declared.length);
	});
});
