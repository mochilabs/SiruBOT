import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isConfigLoaded, setConfigForTesting } from './config.ts';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** import 시점에 부작용을 일으키는 게 계약인 파일 — .env 로딩/신호 핸들러(environment, setup)와 진입점(index)이에요. */
const SIDE_EFFECT_ENTRIES = new Set(['index.ts', 'core/environment.ts', 'core/setup.ts']);

function listModules(dir: string): string[] {
	const result: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) result.push(...listModules(full));
		else if (entry.name.endsWith('.ts') && !/\.(test|testing|d)\.ts$/.test(entry.name)) result.push(full);
	}
	return result;
}

describe('Config는 import 시점에 읽지 않아요 (.env 로딩보다 먼저 읽히면 안 돼요)', () => {
	it('진입점·.env 로더를 뺀 모든 모듈을 import해도 loadConfig가 호출되지 않아요', async () => {
		setConfigForTesting(null);
		const files = listModules(SRC_ROOT)
			.filter((file) => !SIDE_EFFECT_ENTRIES.has(path.relative(SRC_ROOT, file).split(path.sep).join('/')))
			.sort();
		expect(files.length).toBeGreaterThan(100);

		const failures: string[] = [];
		for (const file of files) {
			try {
				await import(file);
			} catch (error) {
				failures.push(`${path.relative(SRC_ROOT, file)}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		expect(failures, `import 중 오류 (Config를 import 시점에 읽은 모듈일 수 있어요):\n${failures.join('\n')}`).toEqual([]);
		expect(isConfigLoaded()).toBe(false);
	}, 120_000);
});
