/**
 * Architecture guard rail (ratchet).
 *
 * This test scans the static runtime imports of `apps/bot/src` and enforces layering rules.
 * Violations that already exist are listed in the allowlists below so the test passes today,
 * but the lists may only SHRINK. Do not add an entry to make the test pass without a written
 * reason; move the code or depend in the other direction instead. When a violation is fixed,
 * delete its entry (the test fails on stale entries to force that).
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
const ALLOWED_CYCLES: string[] = [
	'modules/audio/lavalink/handlers/mixerHandlers.ts <-> services/mixerService.ts',
	'modules/audio/lavalink/queue/queueWrapper.ts <-> services/sponsorBlockService.ts'
];

/** `services/` -> `modules/` edges that exist today. Only delete from this list. */
const ALLOWED_SERVICES_TO_MODULES: string[] = [
	'services/aiTools/botHelp.ts -> modules/general/utils/commandMentions.ts',
	'services/aiTools/botSettings.ts -> modules/audio/utils/permissionCheck.ts',
	'services/aiTools/music.ts -> modules/audio/lavalink/autoPlayRelated.ts',
	'services/aiTools/music.ts -> modules/audio/lavalink/handlers/playbackWatchdog.ts',
	'services/aiTools/music.ts -> modules/audio/lavalink/player/nowPlaying.ts',
	'services/aiTools/music.ts -> modules/audio/utils/filterPresets.ts',
	'services/aiTools/music.ts -> modules/audio/utils/permissionCheck.ts',
	'services/aiTools/music.ts -> modules/audio/utils/timeParse.ts',
	'services/aiTools/musicSettings.ts -> modules/audio/lavalink/autoPlayRelated.ts',
	'services/aiTools/musicSettings.ts -> modules/audio/utils/permissionCheck.ts',
	'services/aiTools/ohaasa.ts -> modules/games/utils/ohaasaService.ts',
	'services/aiTools/ohaasa.ts -> modules/general/utils/userProfile.ts',
	'services/audioService.ts -> modules/audio/lavalink/autoPlayRelated.ts',
	'services/audioService.ts -> modules/audio/lavalink/handlers/mixerHandlers.ts',
	'services/audioService.ts -> modules/audio/lavalink/queue/queueWrapper.ts',
	'services/audioService.ts -> modules/audio/view/play.ts',
	'services/botAdminResponder.ts -> modules/audio/lavalink/redisStore.ts',
	'services/chatTts.ts -> modules/audio/lavalink/requester.ts',
	'services/customCommands/interpreter.ts -> modules/general/view/customCommand.ts',
	'services/memberGreetingService.ts -> modules/general/view/greeting.ts',
	'services/mixerService.ts -> modules/audio/lavalink/autoPlayRelated.ts',
	'services/mixerService.ts -> modules/audio/lavalink/handlers/mixerHandlers.ts',
	'services/mixerService.ts -> modules/audio/lavalink/queue/queueWrapper.ts',
	'services/panelPostResponder.ts -> modules/general/view/ticket.ts',
	'services/playerWebResponder.ts -> modules/audio/view/play.ts',
	'services/playlistPlayback.ts -> modules/audio/utils/source.ts',
	'services/rolePanelService.ts -> modules/general/view/rolePanel.ts',
	'services/skipPolicy.ts -> modules/audio/lavalink/autoPlayRelated.ts',
	'services/skipPolicy.ts -> modules/audio/lavalink/requester.ts',
	'services/skipPolicy.ts -> modules/audio/managers/voteSkip.ts',
	'services/skipPolicy.ts -> modules/audio/utils/queueSelection.ts',
	'services/skipPolicy.ts -> modules/audio/view/skip.ts',
	'services/sponsorBlockService.ts -> modules/audio/lavalink/queue/queueWrapper.ts',
	'services/sponsorBlockService.ts -> modules/general/view/notice.ts',
	'services/tempVoiceService.ts -> modules/general/view/notice.ts',
	'services/ticketService.ts -> modules/general/view/notice.ts',
	'services/ticketService.ts -> modules/general/view/ticket.ts',
	'services/trackService.ts -> modules/audio/lavalink/requester.ts'
];

/** `lib/` -> `modules/` edges that exist today. Only delete from this list. */
const ALLOWED_LIB_TO_MODULES: string[] = [
	'lib/autocomplete.ts -> modules/audio/lavalink/autoPlayRelated.ts',
	'lib/autocomplete.ts -> modules/audio/utils/queueSelection.ts',
	'lib/confirmation.ts -> modules/general/view/confirmation.ts',
	'lib/confirmation.ts -> modules/general/view/notice.ts'
];

/** `modules/` -> `core/` edges that exist today. Only delete from this list. */
const ALLOWED_MODULES_TO_CORE: string[] = [
	'modules/audio/lavalink/handlers/base.ts -> core/logger.ts',
	'modules/audio/lavalink/pendingWriteStore.ts -> core/logger.ts',
	'modules/audio/lavalink/player/playerNotifier.ts -> core/logger.ts',
	'modules/audio/lavalink/redisStore.ts -> core/logger.ts',
	'modules/audio/listeners/voiceStateUpdate.ts -> core/logger.ts'
];

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
});
