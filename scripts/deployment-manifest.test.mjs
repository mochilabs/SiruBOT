import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { APPS, changedApps, changedAppsSince, assembleManifest, validateManifest, selectManifest } from './deployment-manifest.mjs';

const repository = 'mochilabs/SiruBOT';
const branch = 'beta';
const digest = `sha256:${'a'.repeat(64)}`;
const previous = assembleManifest({
	repository,
	branch,
	commit: 'a'.repeat(40),
	runId: 10,
	changed: APPS,
	built: Object.fromEntries(APPS.map((app) => [app, digest]))
});

test('initial deployment builds all apps', () => {
	assert.deepEqual(changedApps(['apps/bot/src/index.ts'], false), APPS);
});
test('app-only changes build that app; documentation builds nothing', () => {
	assert.deepEqual(changedApps(['apps/bot/src/index.ts'], true), ['bot']);
	assert.deepEqual(changedApps(['README.md', 'docker/deploy.config.example.json'], true), []);
});
test('all shared Docker inputs invalidate all apps', () => {
	for (const file of [
		'.dockerignore',
		'.yarnrc.yml',
		'tsconfig.base.json',
		'resources/fonts/NotoSansKR.ttf',
		'yarn.lock',
		'Dockerfile',
		'packages/utils/src/index.ts',
		'scripts/deploy.mjs',
		'.github/workflows/docker-beta.yml'
	]) {
		assert.deepEqual(changedApps([file], true), APPS, file);
	}
});
for (const [source, destination, expected] of [
	['apps/bot/src/old.ts', 'apps/dashboard/src/new.ts', ['bot', 'dashboard']],
	['apps/bot/src/old.ts', 'archive/old.ts', ['bot']],
	['apps/bot/src/old.ts', 'apps/bot/src/new.ts', ['bot']],
	['resources/old.ts', 'apps/bot/src/new.ts', APPS]
]) {
	test(`Git rename ${source} -> ${destination} rebuilds every affected app`, () => {
		const dir = mkdtempSync(join(tmpdir(), 'sirubot-manifest-rename-'));
		const run = (program, args) => execFileSync(program, args, { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
		const commit = (message) => run('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', message]);
		try {
			run('git', ['init', '--quiet']);
			run('git', ['config', 'user.name', 'Manifest Test']);
			run('git', ['config', 'user.email', 'manifest-test@example.invalid']);
			run('git', ['config', 'diff.renames', 'true']);
			mkdirSync(dirname(join(dir, source)), { recursive: true });
			writeFileSync(join(dir, source), 'export const fixture = 42;\n');
			run('git', ['add', '.']);
			commit('initial file');
			const before = run('git', ['rev-parse', 'HEAD']);
			mkdirSync(dirname(join(dir, destination)), { recursive: true });
			renameSync(join(dir, source), join(dir, destination));
			run('git', ['add', '.']);
			commit('move file');
			const after = run('git', ['rev-parse', 'HEAD']);
			assert.match(run('git', ['diff', '--name-status', before, after]), /^R100\s/);
			assert.deepEqual(changedAppsSince(before, after, run), expected);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
}
test('unchanged app digests come from the last successful manifest', () => {
	const next = assembleManifest({
		repository,
		branch,
		commit: 'b'.repeat(40),
		runId: 11,
		previous,
		changed: ['bot'],
		built: { bot: `sha256:${'b'.repeat(64)}` }
	});
	assert.equal(next.images.dashboard, previous.images.dashboard);
	assert.notEqual(next.images.bot, previous.images.bot);
	assert.equal(next.runId, 11);
});
test('incomplete builds and foreign image references cannot be published', () => {
	assert.throws(() =>
		assembleManifest({
			repository,
			branch,
			commit: 'b'.repeat(40),
			runId: 11,
			previous,
			changed: ['bot'],
			built: {}
		})
	);
	assert.throws(() =>
		validateManifest(
			{
				...previous,
				images: { ...previous.images, bot: `evil/bot@${digest}` }
			},
			repository,
			branch
		)
	);
	assert.throws(() => validateManifest({ ...previous, branch: 'main' }, repository, branch));
});

function fakeRun(runs, manifests) {
	return (program, args) => {
		assert.equal(program, 'gh');
		if (args[0] === 'api') {
			if (args[1] === '--method') return JSON.stringify({ workflow_runs: runs });
			return JSON.stringify(runs.find((item) => String(item.id) === args[1].split('/').at(-1)));
		}
		const manifest = manifests[args[2]];
		if (!manifest) throw new Error('artifact expired');
		writeFileSync(join(args[args.indexOf('--dir') + 1], 'deployment-manifest.json'), JSON.stringify(manifest));
		return '';
	};
}
const success = {
	id: 10,
	status: 'completed',
	conclusion: 'success',
	head_branch: branch,
	head_sha: previous.commit,
	repository: { full_name: repository }
};

test('failed/cancelled/running CI and expired artifacts are skipped', () => {
	const runs = [
		{ ...success, id: 14, status: 'in_progress' },
		{ ...success, id: 13, conclusion: 'failure' },
		{ ...success, id: 12, conclusion: 'cancelled' },
		{ ...success, id: 11 },
		success
	];
	assert.deepEqual(selectManifest({ repository, branch }, fakeRun(runs, { 10: previous })), previous);
});
test('explicit run must be successful and match the artifact commit', () => {
	assert.throws(() => selectManifest({ repository, branch, runId: 10 }, fakeRun([{ ...success, conclusion: 'failure' }], { 10: previous })));
	assert.throws(() => selectManifest({ repository, branch, runId: 10 }, fakeRun([success], { 10: { ...previous, commit: 'b'.repeat(40) } })));
});
