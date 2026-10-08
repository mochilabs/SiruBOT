import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const APPS = ['bot', 'dashboard', 'shardmanager', 'data-api'];
const digestPattern = /^sha256:[a-f0-9]{64}$/;

export function validateManifest(manifest, repository, branch) {
	if (
		manifest?.schemaVersion !== 1 ||
		manifest.repository !== repository ||
		manifest.branch !== branch ||
		!Number.isSafeInteger(manifest.runId) ||
		manifest.runId < 1 ||
		!/^[a-f0-9]{40}$/.test(manifest.commit)
	) {
		throw new Error('배포 manifest의 저장소·브랜치·버전 정보가 올바르지 않습니다.');
	}
	for (const app of APPS) {
		const prefix = `ghcr.io/${repository.toLowerCase()}-${app}@`;
		if (
			typeof manifest.images?.[app] !== 'string' ||
			!manifest.images[app].startsWith(prefix) ||
			!digestPattern.test(manifest.images[app].slice(prefix.length))
		) {
			throw new Error(`배포 manifest의 ${app} 이미지 digest가 올바르지 않습니다.`);
		}
	}
	return manifest;
}

export function changedApps(files, hasBaseline) {
	if (
		!hasBaseline ||
		files.some((file) =>
			/^(packages\/|scripts\/|resources\/|Dockerfile$|\.dockerignore$|\.yarnrc\.yml$|package\.json$|yarn\.lock$|turbo\.json$|tsconfig[^/]*\.json$|\.github\/workflows\/docker-)/.test(
				file
			)
		)
	) {
		return [...APPS];
	}
	return APPS.filter((app) => files.some((file) => file.startsWith(`apps/${app}/`)));
}

export function assembleManifest({ repository, branch, commit, runId, previous, changed, built }) {
	if (previous) validateManifest(previous, repository, branch);
	const images = { ...previous?.images };
	for (const app of changed) {
		if (!digestPattern.test(built[app] ?? '')) throw new Error(`${app} 빌드 결과가 없습니다.`);
		images[app] = `ghcr.io/${repository.toLowerCase()}-${app}@${built[app]}`;
	}
	return validateManifest(
		{
			schemaVersion: 1,
			repository,
			branch,
			commit,
			runId: Number(runId),
			images
		},
		repository,
		branch
	);
}

export function ghJson(args, run = command) {
	return JSON.parse(run('gh', args));
}

export function command(program, args, options = {}) {
	try {
		return execFileSync(program, args, {
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
			maxBuffer: 16 * 1024 * 1024,
			timeout: 60_000,
			...options
		}).trim();
	} catch {
		// Docker/gh stderr can contain rendered environment values. Never echo it.
		throw new Error(`${program} ${args[0] ?? ''} 실행에 실패했습니다. 연결·인증·설정을 확인하세요.`);
	}
}

export function successfulRuns(repository, branch, workflow, run = command) {
	return ghJson(
		[
			'api',
			'--method',
			'GET',
			`repos/${repository}/actions/workflows/${workflow}/runs`,
			'-f',
			`branch=${branch}`,
			'-f',
			'status=success',
			'-f',
			'per_page=100'
		],
		run
	).workflow_runs.filter((item) => item.status === 'completed' && item.conclusion === 'success' && item.head_branch === branch);
}

export function downloadManifest(repository, runId, run = command) {
	const directory = mkdtempSync(join(tmpdir(), 'sirubot-manifest-'));
	try {
		run('gh', ['run', 'download', String(runId), '--repo', repository, '--name', 'deployment-manifest', '--dir', directory]);
		return JSON.parse(readFileSync(join(directory, 'deployment-manifest.json'), 'utf8'));
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

export function selectManifest({ repository, branch, workflow = 'docker-beta.yml', runId }, run = command) {
	const runs = runId ? [ghJson(['api', `repos/${repository}/actions/runs/${runId}`], run)] : successfulRuns(repository, branch, workflow, run);
	for (const item of runs) {
		if (
			item.status !== 'completed' ||
			item.conclusion !== 'success' ||
			item.head_branch !== branch ||
			item.repository?.full_name?.toLowerCase() !== repository.toLowerCase()
		) {
			if (runId) throw new Error('지정한 CI 실행은 이 저장소·브랜치의 성공한 실행이 아닙니다.');
			continue;
		}
		try {
			const manifest = validateManifest(downloadManifest(repository, item.id, run), repository, branch);
			if (manifest.runId !== item.id || manifest.commit !== item.head_sha) throw new Error('CI 실행과 manifest가 일치하지 않습니다.');
			return manifest;
		} catch (error) {
			if (runId) throw error;
		}
	}
	throw new Error('사용 가능한 성공 배포 manifest가 없습니다. 이미지 CI를 먼저 실행하세요.');
}

function ciMain() {
	const directory = resolve(process.env.DEPLOY_CI_DIR ?? '.deploy/ci');
	mkdirSync(directory, { recursive: true });
	const repository = process.env.GITHUB_REPOSITORY;
	const branch = process.env.GITHUB_REF_NAME;
	const commit = process.env.GITHUB_SHA;
	const runId = process.env.GITHUB_RUN_ID;
	const [action, app, digest] = process.argv.slice(2);
	if (action === 'prepare') {
		let previous;
		if (process.env.DEPLOY_FULL_BUILD !== 'true') {
			try {
				previous = selectManifest({ repository, branch });
				command('git', ['merge-base', '--is-ancestor', previous.commit, commit]);
			} catch {
				previous = undefined;
			}
		}
		let changed = [...APPS];
		if (previous) {
			try {
				changed = changedApps(command('git', ['diff', '--name-only', previous.commit, commit]).split('\n'), true);
			} catch {
				previous = undefined;
			}
		}
		writeFileSync(join(directory, 'plan.json'), JSON.stringify({ previous, changed }));
		if (process.env.GITHUB_OUTPUT) {
			writeFileSync(process.env.GITHUB_OUTPUT, APPS.map((name) => `${name}=${changed.includes(name)}`).join('\n') + '\n', { flag: 'a' });
		}
	} else if (action === 'image') {
		if (!APPS.includes(app) || !digestPattern.test(digest ?? '')) throw new Error('빌드 digest가 올바르지 않습니다.');
		writeFileSync(join(directory, `${app}.json`), JSON.stringify({ app, digest }));
	} else if (action === 'finalize') {
		const planPath = join(directory, 'plan.json');
		let plan = { changed: [...APPS] };
		if (process.env.GITHUB_EVENT_NAME !== 'release') plan = JSON.parse(readFileSync(planPath, 'utf8'));
		const built = {};
		for (const file of readdirSync(directory).filter((name) => APPS.some((nameApp) => name === `${nameApp}.json`))) {
			const item = JSON.parse(readFileSync(join(directory, file), 'utf8'));
			built[item.app] = item.digest;
		}
		const manifest = assembleManifest({
			repository,
			branch,
			commit,
			runId,
			...plan,
			built
		});
		writeFileSync(join(directory, 'deployment-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
	} else throw new Error('prepare, image, finalize 중 하나를 지정하세요.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try {
		ciMain();
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
