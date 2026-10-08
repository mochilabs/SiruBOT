import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPS, changedApps, assembleManifest, validateManifest, selectManifest } from './deployment-manifest.mjs';

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
