/**
 * Architecture guard rail (ratchet).
 *
 * This test scans the static runtime imports of `apps/bot/src` and enforces layering rules.
 * Violations that already exist are listed in the allowlists below so the test passes today,
 * but the lists may only SHRINK. Do not add an entry to make the test pass without a written
 * reason; move the code or depend in the other direction instead. When a violation is fixed,
 * delete its entry (the test fails on stale entries to force that).
 *
 * `features/<name>/application/` is the framework-free application layer: it may not import `@sapphire/*`, view files (`view/` or `views/`), or Sapphire
 * pieces (`{modules/<name>,features/<name>/discord}/{interaction-handlers,commands,subcommands,listeners}`). Existing violations are listed in
 * `APPLICATION_LAYER_DEBT` with the reason and what removing each takes; that list may only shrink.
 *
 * `features/<a>/` may import another feature `features/<b>/` only through `features/<b>/index.ts` (its public surface). No allowlist.
 *
 * `services/` must not import `container` (see `SERVICES_CONTAINER_ALLOWED`); services receive deps from `BotApplication.setupServices`.
 *
 * Environment access: no non-test file may contain `process.env` or import `@skyra/env-utilities` except the short, reasoned lists below (see
 * `PROCESS_ENV_ALLOWED` / `ENV_UTILITIES_ALLOWED`). Everything else reads `getConfig()` (lib/config.ts); `features/<name>/application/` takes values via `deps`.
 *
 * Limits: only static `import`/`export ... from` statements are parsed. `import type` / `export type`
 * and dynamic `import()` are ignored.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.dirname(fileURLToPath(import.meta.url));

/** Allowed import cycles; each entry is the sorted file list of one strongly connected component, joined by ' <-> '. */
const ALLOWED_CYCLES: string[] = ['features/music/lavalink/handlers/mixerHandlers.ts <-> services/mixerService.ts'];

/** `services/` -> `modules/` edges that exist today. Only delete from this list. */
const ALLOWED_SERVICES_TO_MODULES: string[] = [
	'services/audioService.ts -> modules/audio/view/play.ts',
	'services/playlistPlayback.ts -> modules/audio/utils/source.ts',
	'services/skipPolicy.ts -> modules/audio/managers/voteSkip.ts',
	'services/skipPolicy.ts -> modules/audio/utils/queueSelection.ts',
	'services/skipPolicy.ts -> modules/audio/view/skip.ts',
	'services/sponsorBlockService.ts -> modules/general/view/notice.ts'
];

/** `lib/` -> `modules/` edges that exist today. Only delete from this list. */
const ALLOWED_LIB_TO_MODULES: string[] = [
	'lib/autocomplete.ts -> modules/audio/utils/queueSelection.ts',
	'lib/confirmation.ts -> modules/general/view/confirmation.ts',
	'lib/confirmation.ts -> modules/general/view/notice.ts'
];

/** `modules/` -> `core/` edges that exist today. Only delete from this list. */
const ALLOWED_MODULES_TO_CORE: string[] = ['modules/audio/listeners/voiceStateUpdate.ts -> core/logger.ts'];

/**
 * Imports in `features/<name>/application/` that break the application-layer rule today, as `<file> -> <specifier>`, each with the reason and what
 * removal takes. Only delete from this list.
 */
const APPLICATION_LAYER_DEBT: Record<string, string> = {};

/** Non-test files that may contain `process.env`, each with the reason. Only delete from this list. */
const PROCESS_ENV_ALLOWED: Record<string, string> = {
	'lib/config.ts': 'loadConfig(env) is pure; getConfig() is the single place that hands it process.env'
};

/** Non-test files that may import `@skyra/env-utilities`, each with the reason. Only delete from this list. */
const ENV_UTILITIES_ALLOWED: Record<string, string> = {
	'core/environment.ts': 'setup() loads .env into the process environment; it must run before the first getConfig()'
};

/** Non-test files under `services/` that still import `container`, each with the reason. Only delete from this list. */
const SERVICES_CONTAINER_ALLOWED: Record<string, string> = {};

function listSourceFiles(dir: string): string[] {
	const result: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) result.push(...listSourceFiles(full));
		else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) result.push(full);
	}
	return result;
}

const toRel = (file: string) => path.relative(SRC_ROOT, file).split(path.sep).join('/');
// Matches `import ... from '...'`, `export ... from '...'` and side-effect `import '...'`; group 1 is the `type` modifier, group 3 the specifier.
const IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?([^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;

/** Every static runtime import specifier (relative or bare) per file, relative path from src. Used by the application-layer rule. */
function collectSpecifiers(): Map<string, string[]> {
	const specifiers = new Map<string, string[]>();
	for (const file of listSourceFiles(SRC_ROOT)) {
		const list: string[] = [];
		for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
			if (!match[1]) list.push(match[3]);
		}
		specifiers.set(toRel(file), list);
	}
	return specifiers;
}

/** Why an import from `features/<name>/application/` is forbidden, or null when it is fine. */
function applicationImportViolation(file: string, specifier: string): string | null {
	if (specifier === '@sapphire/framework' || specifier.startsWith('@sapphire/')) return 'imports @sapphire/*';
	if (!specifier.startsWith('.')) return null;
	const target = toRel(path.resolve(path.dirname(path.join(SRC_ROOT, file)), specifier));
	if (/(^|\/)views?\//.test(target)) return 'imports a view file';
	if (/^(modules\/[^/]+|features\/[^/]+\/discord)\/(interaction-handlers|commands|subcommands|listeners)\//.test(target))
		return 'imports a Sapphire piece';
	return null;
}

/** Runtime import graph: relative path (from src) -> set of relative paths it imports. */
function buildGraph(): Map<string, Set<string>> {
	const files = listSourceFiles(SRC_ROOT);
	const known = new Set(files.map(toRel));
	const graph = new Map<string, Set<string>>();
	for (const file of files) {
		const from = toRel(file);
		const targets = new Set<string>();
		for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
			const specifier = match[3];
			if (match[1] || !specifier.startsWith('.')) continue;
			const to = toRel(path.resolve(path.dirname(file), specifier));
			if (known.has(to)) targets.add(to);
		}
		graph.set(from, targets);
	}
	return graph;
}

/** Tarjan strongly connected components with more than one file, each sorted and joined by ' <-> '. */
function findCycles(graph: Map<string, Set<string>>): string[] {
	let counter = 0;
	const index = new Map<string, number>();
	const low = new Map<string, number>();
	const stack: string[] = [];
	const onStack = new Set<string>();
	const cycles: string[] = [];
	const visit = (node: string): void => {
		index.set(node, counter);
		low.set(node, counter++);
		stack.push(node);
		onStack.add(node);
		for (const next of graph.get(node) ?? []) {
			if (!index.has(next)) {
				visit(next);
				low.set(node, Math.min(low.get(node)!, low.get(next)!));
			} else if (onStack.has(next)) {
				low.set(node, Math.min(low.get(node)!, index.get(next)!));
			}
		}
		if (low.get(node) === index.get(node)) {
			const component: string[] = [];
			let member: string;
			do {
				member = stack.pop()!;
				onStack.delete(member);
				component.push(member);
			} while (member !== node);
			if (component.length > 1) cycles.push(component.sort().join(' <-> '));
		}
	};
	for (const node of graph.keys()) if (!index.has(node)) visit(node);
	return cycles.sort();
}

/** Cross-feature edges that bypass the other feature's `index.ts` (`features/<a>/... -> features/<b>/<not index.ts>`). */
function crossFeatureViolations(graph: Map<string, Set<string>>): string[] {
	const violations: string[] = [];
	for (const [from, targets] of graph) {
		const fromFeature = /^features\/([^/]+)\//.exec(from)?.[1];
		if (!fromFeature) continue;
		for (const to of targets) {
			const toFeature = /^features\/([^/]+)\//.exec(to)?.[1];
			if (toFeature && toFeature !== fromFeature && to !== `features/${toFeature}/index.ts`) violations.push(`${from} -> ${to}`);
		}
	}
	return violations.sort();
}

function edgesBetween(graph: Map<string, Set<string>>, fromDir: string, toDir: string): string[] {
	const edges: string[] = [];
	for (const [from, targets] of graph) {
		if (!from.startsWith(`${fromDir}/`)) continue;
		for (const to of targets) if (to.startsWith(`${toDir}/`)) edges.push(`${from} -> ${to}`);
	}
	return edges.sort();
}

/** Fails on edges missing from the allowlist (new violations) and on allowlist entries that no longer exist (stale). */
function expectRatchet(actual: string[], allowed: string[], advice: string): void {
	const allowedSet = new Set(allowed);
	const actualSet = new Set(actual);
	const added = actual.filter((edge) => !allowedSet.has(edge));
	const stale = allowed.filter((edge) => !actualSet.has(edge));
	expect(added, `New forbidden dependency. ${advice}\n  ${added.join('\n  ')}`).toEqual([]);
	expect(stale, `Allowlist entry no longer exists, delete it from the allowlist in architecture.test.ts:\n  ${stale.join('\n  ')}`).toEqual([]);
}

describe('bot architecture guard rails', () => {
	const graph = buildGraph();

	it('has no runtime import cycles beyond the allowlist', () => {
		expectRatchet(findCycles(graph), ALLOWED_CYCLES, 'Break the cycle by moving the shared code into a third file that both sides import.');
	});

	it('services/ does not import from modules/ beyond the allowlist', () => {
		expectRatchet(
			edgesBetween(graph, 'services', 'modules'),
			ALLOWED_SERVICES_TO_MODULES,
			'Move the needed code into services/ or lib/, or have the module call the service instead (modules depend on services, not the reverse).'
		);
	});

	it('services/ does not import container beyond the allowlist', () => {
		const importsContainer = (file: string) =>
			/^\s*import\s+(?!type\b)\{[^}]*\bcontainer\b[^}]*\}\s+from\s+['"]@sapphire\/(framework|pieces)['"]/m.test(
				readFileSync(path.join(SRC_ROOT, file), 'utf8')
			);
		const actual = listSourceFiles(SRC_ROOT)
			.map(toRel)
			.filter((file) => file.startsWith('services/') && importsContainer(file))
			.sort();
		expectRatchet(
			actual,
			Object.keys(SERVICES_CONTAINER_ALLOWED).sort(),
			'Services take their dependencies through deps; BotApplication.setupServices is the only place that reads container.'
		);
	});

	it('lib/ does not import from modules/ beyond the allowlist', () => {
		expectRatchet(
			edgesBetween(graph, 'lib', 'modules'),
			ALLOWED_LIB_TO_MODULES,
			'Move the needed code into lib/, or have the module import lib instead (modules depend on lib, not the reverse).'
		);
	});

	it('modules/ does not import from core/ beyond the allowlist', () => {
		expectRatchet(
			edgesBetween(graph, 'modules', 'core'),
			ALLOWED_MODULES_TO_CORE,
			'Move the shared code (for example the logger) out of core/ into lib/, or receive it via the container; core/ wires modules, so modules must not depend on it.'
		);
	});

	it('features/*/application/ stays free of Sapphire, views and pieces', () => {
		const violations: string[] = [];
		for (const [file, list] of collectSpecifiers()) {
			if (!/^features\/[^/]+\/application\//.test(file)) continue;
			for (const specifier of list) {
				if (applicationImportViolation(file, specifier)) violations.push(`${file} -> ${specifier}`);
			}
		}
		expectRatchet(
			violations.sort(),
			Object.keys(APPLICATION_LAYER_DEBT).sort(),
			'The application layer must not depend on frameworks, views or Sapphire pieces; pass what it needs through deps instead.'
		);
	});

	it('features/<a>/ imports features/<b>/ only through its index.ts', () => {
		const violations = crossFeatureViolations(graph);
		expect(
			violations,
			`Import the other feature through features/<name>/index.ts, and export what you need from there:\n  ${violations.join('\n  ')}`
		).toEqual([]);
	});

	it('the cross-feature rule catches deep imports', () => {
		const fake = new Map([
			['features/a/discord/x.ts', new Set(['features/b/application/y.ts'])],
			['features/c/discord/x.ts', new Set(['features/d/index.ts', 'features/c/application/z.ts'])]
		]);
		expect(crossFeatureViolations(fake)).toEqual(['features/a/discord/x.ts -> features/b/application/y.ts']);
	});

	it('the application-layer rule catches forbidden imports', () => {
		const file = 'features/music/application/control.ts';
		expect(applicationImportViolation(file, '@sapphire/framework')).not.toBeNull();
		expect(applicationImportViolation(file, '@sapphire/pieces')).not.toBeNull();
		expect(applicationImportViolation(file, '../../../modules/audio/view/volume.ts')).not.toBeNull();
		expect(applicationImportViolation(file, '../../../modules/audio/subcommands/volume.ts')).not.toBeNull();
		expect(applicationImportViolation(file, '../../../modules/audio/interaction-handlers/controllerButton.ts')).not.toBeNull();
		expect(applicationImportViolation(file, '../../../modules/general/listeners/message/embedFix.ts')).not.toBeNull();
		expect(applicationImportViolation(file, '../discord/views/ticket.ts')).not.toBeNull();
		expect(applicationImportViolation(file, '../discord/interaction-handlers/ticketButton.ts')).not.toBeNull();
		expect(applicationImportViolation(file, '../discord/commands/ticket.ts')).not.toBeNull();
		expect(applicationImportViolation(file, '../../../lib/appError.ts')).toBeNull();
		expect(applicationImportViolation(file, 'discord.js')).toBeNull();
	});

	it('process.env is only touched by the allowed files', () => {
		const offenders = listSourceFiles(SRC_ROOT)
			.filter((file) => /process\.env/.test(readFileSync(file, 'utf8')))
			.map(toRel)
			.filter((file) => !(file in PROCESS_ENV_ALLOWED));
		expect(offenders, `Read configuration through getConfig() (lib/config.ts) instead of process.env:\n  ${offenders.join('\n  ')}`).toEqual([]);
		const stale = Object.keys(PROCESS_ENV_ALLOWED).filter((file) => !/process\.env/.test(readFileSync(path.join(SRC_ROOT, file), 'utf8')));
		expect(stale, `PROCESS_ENV_ALLOWED entry no longer contains process.env, delete it:\n  ${stale.join('\n  ')}`).toEqual([]);
	});

	it('@skyra/env-utilities is only imported by the allowed files', () => {
		const offenders = [...collectSpecifiers()]
			.filter(([file, list]) => list.includes('@skyra/env-utilities') && !(file in ENV_UTILITIES_ALLOWED))
			.map(([file]) => file);
		expect(offenders, `envParse* is gone; read values from getConfig() (lib/config.ts):\n  ${offenders.join('\n  ')}`).toEqual([]);
		const stale = Object.keys(ENV_UTILITIES_ALLOWED).filter((file) => !collectSpecifiers().get(file)?.includes('@skyra/env-utilities'));
		expect(stale, `ENV_UTILITIES_ALLOWED entry no longer imports it, delete it:\n  ${stale.join('\n  ')}`).toEqual([]);
	});

	it('features/*/application/ never calls getConfig() — values arrive through deps', () => {
		const offenders = listSourceFiles(SRC_ROOT)
			.map(toRel)
			.filter((file) => /^features\/[^/]+\/application\//.test(file))
			.filter((file) => /\bimport\s[^;]*\bgetConfig\b|lib\/config\.ts/.test(readFileSync(path.join(SRC_ROOT, file), 'utf8')));
		expect(
			offenders,
			`The application layer must receive config values through its deps, not call getConfig():\n  ${offenders.join('\n  ')}`
		).toEqual([]);
	});
});
