import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import {
	options,
	environments,
	composeService,
	platformUpdatePlan,
	fingerprint,
	escapeInterpolation,
	acquireLock,
	taskSummary,
	waitForServices,
	protectInfra,
	redactValues,
	main
} from './deploy.mjs';
import { APPS, assembleManifest } from './deployment-manifest.mjs';

const digest = `sha256:${'a'.repeat(64)}`;
const repository = 'mochilabs/SiruBOT';
const common = {
	DISCORD_TOKEN: 'fake-discord-secret',
	DATABASE_URL: 'postgresql://example/db',
	REDIS_URL: 'redis://example',
	LAVALINK_HOSTS: 'main_example_2333',
	AUTH_KEY: 'fake-auth-secret',
	AUTH_DISCORD_ID: '123',
	AUTH_DISCORD_SECRET: 'fake-oauth-secret',
	AUTH_SECRET: 'fake-session-secret'
};

function service(app, stack = 'test') {
	return {
		ID: `id-${app}`,
		Spec: {
			Name: `${stack}_${app}`,
			Labels: { 'com.docker.stack.namespace': stack },
			TaskTemplate: {
				ContainerSpec: {
					Image: `ghcr.io/mochilabs/sirubot-${app}:beta@${digest}`,
					Env: ['KEEP=original'],
					Healthcheck: {
						Test: ['CMD', 'true'],
						Interval: 1e9,
						Timeout: 1e9,
						StartPeriod: 1e9,
						Retries: 3
					},
					StopGracePeriod: 30e9
				},
				Networks: [{ Target: 'net-id', Aliases: [app] }],
				RestartPolicy: {
					Condition: 'any',
					Delay: 5e9,
					MaxAttempts: 0,
					Window: 0
				},
				Placement: { Constraints: ['node.labels.app == true'] }
			},
			Mode: { Replicated: { Replicas: app === 'bot' ? 2 : 1 } },
			UpdateConfig: {
				Parallelism: 1,
				Delay: 0,
				Monitor: 5e9,
				FailureAction: 'pause',
				Order: 'stop-first'
			},
			EndpointSpec: { Mode: 'vip' }
		}
	};
}
function tasks(item) {
	return Array.from({ length: item.Spec.Mode.Replicated.Replicas }, (_, i) => ({
		ID: `${item.ID}-${i}`,
		NodeID: 'node-id',
		DesiredState: 'running',
		Status: { State: 'running' },
		Spec: {
			ContainerSpec: structuredClone(item.Spec.TaskTemplate.ContainerSpec)
		}
	}));
}
const refs = {
	network: () => 'network',
	volume: (id) => id,
	secret: (id) => id,
	config: (id) => id
};

test('CLI accepts supported options and rejects ambiguous arguments', () => {
	assert.equal(options(['--run', '12', '--with-infra']).runId, '12');
	assert.throws(() => options(['rollback', '--with-infra']));
	assert.throws(() => options(['--run', '--dry-run']));
	assert.throws(() => options(['--unknown']));
});
test('dotenv remains data, including shell expressions and quoted whitespace', () => {
	const parsed = parseEnv('KEY="space $HOME $(touch /tmp/should-not-exist)"\nOTHER=literal');
	assert.equal(parsed.KEY, 'space $HOME $(touch /tmp/should-not-exist)');
	assert.equal(escapeInterpolation(parsed).KEY, 'space $$HOME $$(touch /tmp/should-not-exist)');
});
test('per-app URLs and auth are explicit; existing settings remain', () => {
	const envs = environments(common, {}, Object.fromEntries(APPS.map((app) => [app, { KEEP: 'original' }])));
	assert.equal(envs.bot.SHARD_MANAGER_URL, 'ws://shardmanager:3001/ws');
	assert.equal(envs.dashboard.SHARD_MANAGER_URL, 'http://shardmanager:3001');
	assert.equal(envs.dashboard.SHARD_MANAGER_AUTH_KEY, common.AUTH_KEY);
	assert.equal(envs.bot.KEEP, 'original');
	assert.throws(() => environments({ ...common, AUTH_KEY: '' }, {}, {}));
	assert.throws(() => environments(common, { botShardManagerUrl: 'http://example' }, {}));
});
test('live scale, placement, ports, mounts and healthcheck survive Compose conversion', () => {
	const spec = service('bot').Spec;
	spec.EndpointSpec.Ports = [
		{
			TargetPort: 8080,
			PublishedPort: 18080,
			Protocol: 'tcp',
			PublishMode: 'host'
		}
	];
	spec.TaskTemplate.ContainerSpec.Mounts = [{ Type: 'volume', Source: 'existing-volume', Target: '/data' }];
	const result = composeService(spec, refs);
	assert.equal(result.deploy.replicas, 2);
	assert.deepEqual(result.deploy.placement.constraints, ['node.labels.app == true']);
	assert.equal(result.volumes[0].source, 'existing-volume');
	assert.equal(result.ports[0].published, 18080);
	assert.equal(result.deploy.update_config.order, 'stop-first');
	assert.equal(result.stop_grace_period, '30000000000ns');
});
test('unsupported settings fail before data can be lost', () => {
	const spec = service('bot').Spec;
	spec.TaskTemplate.ContainerSpec.Privileges = {
		CredentialSpec: { File: 'special' }
	};
	assert.throws(() => composeService(spec, refs));
	spec.TaskTemplate.ContainerSpec.Privileges = undefined;
	spec.TaskTemplate.ContainerSpec.UnknownSetting = true;
	assert.throws(() => composeService(spec, refs));
});
test('tag with same digest and reordered keys compare equal', () => {
	assert.equal(fingerprint({ image: `repo:beta@${digest}`, env: { A: 1, B: 2 } }), fingerprint({ env: { B: 2, A: 1 }, image: `repo@${digest}` }));
});
test('local lock is exclusive and released', () => {
	const dir = mkdtempSync(join(tmpdir(), 'sirubot-lock-test-'));
	try {
		const release = acquireLock(dir);
		assert.throws(() => acquireLock(dir));
		release();
		acquireLock(dir)();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
test('convergence counts current tasks; paused update and auto rollback are failures', () => {
	const item = service('bot');
	assert.equal(taskSummary(item, tasks(item)).ready, true);
	assert.equal(taskSummary(item, tasks(item).slice(1)).ready, false);
	item.UpdateStatus = { State: 'rollback_completed' };
	assert.equal(taskSummary(item, tasks(item)).failed, true);
});
test('completed automatic rollback is accepted only for the matching saved spec and task configuration', () => {
	const item = service('bot');
	item.UpdateStatus = { State: 'rollback_completed' };
	const targets = { [item.Spec.Name]: fingerprint(item.Spec) };
	assert.equal(taskSummary(item, tasks(item), targets).ready, true);
	assert.equal(taskSummary(item, tasks(item), targets).failed, false);
	assert.equal(taskSummary(item, tasks(item)).failed, true);
	const normalizedDns = tasks(item);
	normalizedDns[0].Spec.ContainerSpec.DNSConfig = { Nameservers: [], Search: [], Options: [] };
	assert.equal(taskSummary(item, normalizedDns, targets).ready, true);
	normalizedDns[0].Spec.ContainerSpec.DNSConfig.Nameservers = ['192.0.2.53'];
	assert.equal(taskSummary(item, normalizedDns, targets).ready, false);
	const stale = tasks(item);
	stale[0].Spec.ContainerSpec.Env = ['KEEP=failed-update'];
	assert.equal(taskSummary(item, stale, targets).ready, false);
	item.Spec.TaskTemplate.ContainerSpec.Env = ['KEEP=different-target'];
	assert.equal(taskSummary(item, tasks(item), targets).failed, true);
});
test('convergence has a bounded timeout and requires stable task IDs', async () => {
	const item = service('bot');
	let now = 0;
	const run = (_program, args) =>
		args[0] === 'service' && args[1] === 'inspect' ? JSON.stringify([item]) : args[0] === 'service' ? 'task' : JSON.stringify(tasks(item).slice(1));
	await assert.rejects(
		waitForServices(
			['test_bot'],
			{ timeoutSeconds: 3, pollSeconds: 1, stabilitySeconds: 1 },
			run,
			() => now,
			async (ms) => {
				now += ms;
			}
		),
		/시간 초과/
	);
});
test('infra pins existing storage node and rejects mismatched task mounts', () => {
	const items = Object.fromEntries(
		['redis', 'postgres'].map((app) => {
			const item = service(app, 'infra');
			item.Spec.TaskTemplate.ContainerSpec.Mounts = [
				{
					Type: 'volume',
					Source: `old-${app}`,
					Target: app === 'redis' ? '/data' : '/var/lib/postgresql/data'
				}
			];
			if (app === 'postgres') item.Spec.TaskTemplate.ContainerSpec.Env.push('PGDATA=/var/lib/postgresql/data');
			return [app, item];
		})
	);
	const compose = {
		services: Object.fromEntries(Object.entries(items).map(([app, item]) => [app, composeService(item.Spec, refs)]))
	};
	const run = (_program, args) =>
		args[0] === 'node'
			? JSON.stringify([{ Status: { State: 'ready' }, Spec: { Availability: 'active' } }])
			: args[0] === 'service'
				? args.at(-1).replace('id-', '')
				: JSON.stringify(tasks(items[args.at(-1)]));
	protectInfra(items, compose, run);
	assert.ok(compose.services.postgres.deploy.placement.constraints.includes('node.id == node-id'));
	assert.equal(compose.services.postgres.image, items.postgres.Spec.TaskTemplate.ContainerSpec.Image);
	assert.throws(
		() =>
			protectInfra(items, compose, (_program, args) =>
				args[0] === 'inspect'
					? JSON.stringify([
							{
								...tasks(items[args.at(-1)])[0],
								Spec: { ContainerSpec: { Mounts: [] } }
							}
						])
					: run(_program, args)
			),
		/볼륨 설정/
	);
});

test('stability timer resets when Swarm replaces a running task', async () => {
	const item = service('bot');
	let now = 0;
	const run = (_program, args) =>
		args[0] === 'service' && args[1] === 'inspect'
			? JSON.stringify([item])
			: args[0] === 'service'
				? 'task'
				: JSON.stringify(tasks(item).map((task) => ({ ...task, ID: `${now === 0 ? 'old' : 'new'}-${task.ID}` })));
	await waitForServices(
		['test_bot'],
		{ timeoutSeconds: 5, pollSeconds: 1, stabilitySeconds: 2 },
		run,
		() => now,
		async (ms) => {
			now += ms;
		}
	);
	assert.equal(now, 3000);
});

function fixture() {
	const dir = mkdtempSync(join(tmpdir(), 'sirubot-deploy-test-'));
	const configPath = join(dir, 'config.json');
	writeFileSync(
		configPath,
		JSON.stringify({
			repository,
			branch: 'beta',
			appStack: 'test',
			envFile: './.env',
			timeoutSeconds: 2,
			pollSeconds: 0.001,
			stabilitySeconds: 0.001
		})
	);
	writeFileSync(
		join(dir, '.env'),
		Object.entries(common)
			.map(([key, value]) => `${key}=${value}`)
			.join('\n')
	);
	const items = Object.fromEntries(APPS.map((app) => [app, service(app)]));
	const manifest = assembleManifest({
		repository,
		branch: 'beta',
		commit: 'b'.repeat(40),
		runId: 11,
		changed: APPS,
		built: Object.fromEntries(APPS.map((app) => [app, `sha256:${'b'.repeat(64)}`]))
	});
	const calls = [];
	const logs = [];
	let imageFailure = false;
	let deploymentFailure = false;
	let schemaFailure;
	const run = (program, args, opts = {}) => {
		calls.push({ program, args, opts });
		if (program === 'gh') {
			if (args[0] === 'api')
				return JSON.stringify({
					workflow_runs: [
						{
							id: manifest.runId,
							status: 'completed',
							conclusion: 'success',
							head_branch: 'beta',
							head_sha: manifest.commit,
							repository: { full_name: repository }
						}
					]
				});
			writeFileSync(join(args[args.indexOf('--dir') + 1], 'deployment-manifest.json'), JSON.stringify(manifest));
			return '';
		}
		if (args[0] === 'info')
			return JSON.stringify({
				ControlAvailable: true,
				LocalNodeState: 'active'
			});
		if (args[0] === 'manifest') {
			if (imageFailure) throw new Error('registry unavailable');
			return '{}';
		}
		if (args[0] === 'config') return 'cluster-lock';
		if (args[0] === 'node') return JSON.stringify([{ Status: { State: 'ready' }, Spec: { Availability: 'active' } }]);
		if (args[0] === 'network') return JSON.stringify([{ Name: 'existing-network' }]);
		if (args[0] === 'service' && args[1] === 'inspect')
			return JSON.stringify(args.slice(2).map((name) => Object.values(items).find((item) => item.Spec.Name === name)));
		if (args[0] === 'service' && args[1] === 'ps') {
			if (args.includes('--format')) return `task | failed | ${common.AUTH_KEY}`;
			return args.at(-1);
		}
		if (args[0] === 'inspect') return JSON.stringify(tasks(Object.values(items).find((item) => item.ID === args.at(-1))));
		if (args[0] === 'service' && args[1] === 'update') {
			const item = Object.values(items).find((value) => value.Spec.Name === args.at(-1));
			const c = item.Spec.TaskTemplate.ContainerSpec;
			const env = Object.fromEntries(
				c.Env.map((value) => {
					const i = value.indexOf('=');
					return [value.slice(0, i), value.slice(i + 1)];
				})
			);
			for (let i = 2; i < args.length - 1; i++) {
				const flag = args[i];
				if (flag === '--env-add') {
					const key = args[++i];
					env[key] = opts.env[key];
				} else if (flag === '--env-rm') delete env[args[++i]];
				else if (flag === '--image') c.Image = args[++i];
				else if (flag === '--stop-grace-period') c.StopGracePeriod = Number.parseInt(args[++i]);
				else if (flag === '--replicas') item.Spec.Mode.Replicated.Replicas = Number(args[++i]);
				else if (flag === '--constraint-add') item.Spec.TaskTemplate.Placement.Constraints.push(args[++i]);
				else if (flag === '--constraint-rm') {
					const value = args[++i];
					item.Spec.TaskTemplate.Placement.Constraints = item.Spec.TaskTemplate.Placement.Constraints.filter((v) => v !== value);
				} else if (flag === '--update-order') item.Spec.UpdateConfig.Order = args[++i];
				else if (flag === '--label-add') i++;
			}
			c.Env = Object.entries(env).map(([key, value]) => `${key}=${value}`);
			item.UpdateStatus = { State: 'completed' };
			return item.ID;
		}
		if (args[0] === 'stack' && args[1] === 'config') {
			const stack = JSON.parse(opts.input);
			if ((schemaFailure === 'apps' && stack.services.bot) || (schemaFailure === 'infra' && stack.services.postgres))
				throw new Error('schema failure with sensitive renderer output');
			return opts.input;
		}
		if (args[0] === 'stack' && args[1] === 'deploy') {
			if (deploymentFailure) throw new Error('update failed');
			const stack = JSON.parse(opts.input);
			for (const app of Object.keys(stack.services)) {
				const c = stack.services[app];
				items[app].Spec.TaskTemplate.ContainerSpec.Image = c.image;
				items[app].Spec.TaskTemplate.ContainerSpec.Env = Object.entries(c.environment).map(([key, value]) => `${key}=${value.replaceAll('$$', '$')}`);
				items[app].Spec.TaskTemplate.ContainerSpec.StopGracePeriod =
					c.stop_grace_period === undefined ? 10e9 : Number.parseInt(c.stop_grace_period, 10);
				items[app].UpdateStatus = { State: 'completed' };
			}
			return '';
		}
		throw new Error(`unhandled ${program} ${args.join(' ')}`);
	};
	return {
		dir,
		configPath,
		items,
		manifest,
		calls,
		logs,
		run,
		failImages: () => {
			imageFailure = true;
		},
		failDeploy: (value) => {
			deploymentFailure = value;
		},
		failSchema: (stack) => {
			schemaFailure = stack;
		},
		cleanup: () => rmSync(dir, { recursive: true, force: true })
	};
}

function addInfrastructure(f, pinStorage = false) {
	const settings = JSON.parse(readFileSync(f.configPath, 'utf8'));
	writeFileSync(f.configPath, JSON.stringify({ ...settings, infraStack: 'infra' }));
	for (const app of ['redis', 'postgres']) {
		const item = service(app, 'infra');
		item.Spec.TaskTemplate.ContainerSpec.Mounts = [{ Type: 'volume', Source: `existing-${app}`, Target: '/data' }];
		if (app === 'postgres') item.Spec.TaskTemplate.ContainerSpec.Env.push('PGDATA=/data');
		if (pinStorage) item.Spec.TaskTemplate.Placement.Constraints.push('node.id == node-id');
		f.items[app] = item;
	}
}

for (const [app, field, stale] of [
	['postgres', 'image', (c) => (c.Image = `ghcr.io/example/postgres@sha256:${'d'.repeat(64)}`)],
	['postgres', 'PGDATA', (c) => (c.Env = c.Env.map((v) => (v.startsWith('PGDATA=') ? 'PGDATA=/data/old' : v)))],
	['postgres', 'entrypoint', (c) => (c.Command = ['old-entrypoint'])],
	['redis', 'arguments', (c) => (c.Args = ['redis-server', '--dir', '/data/old'])],
	['redis', 'working directory', (c) => (c.Dir = '/data/old')],
	['postgres', 'stop grace', (c) => (c.StopGracePeriod = 0)]
]) {
	test(`infra rejects a running task with stale ${field} before applying either stack`, async () => {
		for (const dryRun of [false, true]) {
			const f = fixture();
			try {
				addInfrastructure(f);
				const run = (program, args, opts) => {
					const result = f.run(program, args, opts);
					if (args[0] !== 'inspect' || args.at(-1) !== f.items[app].ID) return result;
					const running = JSON.parse(result);
					for (const task of running) stale(task.Spec.ContainerSpec);
					return JSON.stringify(running);
				};
				await assert.rejects(
					main(['--config', f.configPath, '--with-infra', ...(dryRun ? ['--dry-run'] : [])], run, () => {}),
					/컨테이너 설정/
				);
				assert.equal(
					f.calls.some((c) => (c.args[0] === 'stack' && c.args[1] === 'deploy') || (c.args[0] === 'service' && c.args[1] === 'update')),
					false
				);
				assert.equal(existsSync(join(f.dir, 'state/previous.json')), false);
				assert.equal(existsSync(join(f.dir, 'state/pending.json')), false);
			} finally {
				f.cleanup();
			}
		}
	});
}
test('infra accepts full matching task configuration with equivalent digest tags and empty DNS defaults', async () => {
	const f = fixture();
	try {
		addInfrastructure(f);
		const run = (program, args, opts) => {
			const result = f.run(program, args, opts);
			if (args[0] !== 'inspect') return result;
			const running = JSON.parse(result);
			for (const task of running) {
				task.Spec.ContainerSpec.DNSConfig = { Nameservers: [], Search: [], Options: [] };
				task.Spec.ContainerSpec.Image = task.Spec.ContainerSpec.Image.replace(':beta@', '@');
			}
			return JSON.stringify(running);
		};
		await main(['--config', f.configPath, '--with-infra', '--dry-run'], run, () => {});
	} finally {
		f.cleanup();
	}
});

test('dry-run reads real deployment inputs but changes no services or state', async () => {
	const f = fixture();
	try {
		await main(['--config', f.configPath, '--dry-run'], f.run, (line) => f.logs.push(line));
		assert.equal(
			f.calls.some((call) => (call.args[0] === 'stack' && call.args[1] === 'deploy') || call.args[0] === 'config'),
			false
		);
		assert.equal(existsSync(join(f.dir, 'state')), false);
		assert.equal(
			f.calls.some((call) => call.args[0] === 'stack' && call.args[1] === 'config'),
			true
		);
		assert.equal(f.logs.join('\n').includes(common.AUTH_KEY), false);
	} finally {
		f.cleanup();
	}
});
test('deploy preserves scale, saves private snapshot, repeated deploy is a no-op, rollback restores env/image', async () => {
	const f = fixture();
	try {
		await main(['--config', f.configPath], f.run, (line) => f.logs.push(line));
		const stackCalls = () => f.calls.filter((call) => call.args[0] === 'stack' && call.args[1] === 'deploy');
		assert.equal(stackCalls().length, 1);
		assert.ok(stackCalls()[0].args.includes('--with-registry-auth'));
		assert.equal(JSON.parse(stackCalls()[0].opts.input).services.bot.deploy.replicas, 2);
		assert.equal(statSync(join(f.dir, 'state/previous.json')).mode & 0o777, 0o600);
		await main(['--config', f.configPath], f.run, (line) => f.logs.push(line));
		assert.equal(stackCalls().length, 1);
		await main(['rollback', '--config', f.configPath], f.run, (line) => f.logs.push(line));
		assert.equal(stackCalls().length, 2);
		assert.equal(f.items.bot.Spec.TaskTemplate.ContainerSpec.Image, `ghcr.io/mochilabs/sirubot-bot:beta@${digest}`);
		assert.deepEqual(f.items.bot.Spec.TaskTemplate.ContainerSpec.Env, ['KEEP=original']);
		assert.equal(f.logs.join('\n').includes(common.AUTH_KEY), false);
	} finally {
		f.cleanup();
	}
});
test('image failure cannot update a stack or expose environment values', async () => {
	const f = fixture();
	try {
		f.failImages();
		await assert.rejects(
			main(['--config', f.configPath], f.run, (line) => f.logs.push(line)),
			/registry/
		);
		assert.equal(
			f.calls.some((call) => call.args[0] === 'stack' && call.args[1] === 'deploy'),
			false
		);
		assert.equal(f.logs.join('\n').includes(common.AUTH_KEY), false);
		assert.equal(existsSync(join(f.dir, 'state/lock')), false);
	} finally {
		f.cleanup();
	}
});
test('failed deployment keeps original snapshot across retry', async () => {
	const f = fixture();
	try {
		f.failDeploy(true);
		await assert.rejects(main(['--config', f.configPath], f.run, () => {}));
		const previous = readFileSync(join(f.dir, 'state/previous.json'), 'utf8');
		f.failDeploy(false);
		await main(['--config', f.configPath], f.run, () => {});
		assert.equal(readFileSync(join(f.dir, 'state/previous.json'), 'utf8'), previous);
		assert.equal(existsSync(join(f.dir, 'state/pending.json')), false);
	} finally {
		f.cleanup();
	}
});
for (const change of ['image', 'environment']) {
	test(`dry-run rejects a pending deployment with a different ${change} without modifying state`, async () => {
		const f = fixture();
		try {
			f.failDeploy(true);
			await assert.rejects(main(['--config', f.configPath], f.run, () => {}));
			const files = ['previous.json', 'pending.json'];
			const original = files.map((file) => readFileSync(join(f.dir, 'state', file), 'utf8'));
			if (change === 'image') {
				f.manifest.runId = 12;
				f.manifest.commit = 'c'.repeat(40);
				for (const app of APPS) f.manifest.images[app] = `ghcr.io/${repository.toLowerCase()}-${app}@sha256:${'c'.repeat(64)}`;
			} else writeFileSync(join(f.dir, '.env'), readFileSync(join(f.dir, '.env'), 'utf8') + '\nNEW_SETTING=changed\n');
			const count = f.calls.length;
			const logs = [];
			await assert.rejects(
				main(['--config', f.configPath, '--dry-run'], f.run, (line) => logs.push(line)),
				/완료되지 않은 배포/
			);
			assert.equal(
				logs.some((line) => line.includes('dry-run 완료')),
				false
			);
			assert.equal(
				f.calls.slice(count).some((c) => c.args[0] === 'config' || (c.args[0] === 'stack' && c.args[1] === 'deploy')),
				false
			);
			assert.deepEqual(
				files.map((file) => readFileSync(join(f.dir, 'state', file), 'utf8')),
				original
			);
		} finally {
			f.cleanup();
		}
	});
}
test('dry-run accepts a matching pending target and rollback while leaving pending state intact', async () => {
	const f = fixture();
	try {
		f.failDeploy(true);
		await assert.rejects(main(['--config', f.configPath], f.run, () => {}));
		const original = readFileSync(join(f.dir, 'state/pending.json'), 'utf8');
		await main(['--config', f.configPath, '--dry-run'], f.run, () => {});
		writeFileSync(join(f.dir, '.env'), readFileSync(join(f.dir, '.env'), 'utf8') + '\nNEW_SETTING=changed\n');
		await main(['rollback', '--config', f.configPath, '--dry-run'], f.run, () => {});
		assert.equal(readFileSync(join(f.dir, 'state/pending.json'), 'utf8'), original);
	} finally {
		f.cleanup();
	}
});
test('manual rollback after Swarm automatic recovery clears pending state and unblocks the next version', async () => {
	const f = fixture();
	try {
		f.failDeploy(true);
		await assert.rejects(main(['--config', f.configPath], f.run, () => {}));
		assert.equal(existsSync(join(f.dir, 'state/pending.json')), true);
		for (const item of Object.values(f.items)) item.UpdateStatus = { State: 'rollback_completed' };
		f.failDeploy(false);
		const applyCount = () => f.calls.filter((call) => call.args[0] === 'stack' && call.args[1] === 'deploy').length;
		await main(['rollback', '--config', f.configPath], f.run, () => {});
		assert.equal(applyCount(), 1);
		assert.equal(existsSync(join(f.dir, 'state/pending.json')), false);
		f.manifest.runId = 12;
		f.manifest.commit = 'c'.repeat(40);
		f.manifest.images.bot = `ghcr.io/mochilabs/sirubot-bot@sha256:${'c'.repeat(64)}`;
		await main(['--config', f.configPath], f.run, () => {});
		assert.equal(applyCount(), 2);
		assert.equal(existsSync(join(f.dir, 'state/pending.json')), false);
		assert.equal(f.items.bot.Spec.TaskTemplate.ContainerSpec.Image, f.manifest.images.bot);
	} finally {
		f.cleanup();
	}
});

test('unsupported groups and DNS options stop before deployment or rollback snapshot writes', async () => {
	for (const fields of [{ Groups: ['1001'] }, { DNSConfig: { Options: ['ndots:2'] } }]) {
		const f = fixture();
		try {
			Object.assign(f.items.bot.Spec.TaskTemplate.ContainerSpec, fields);
			await assert.rejects(
				main(['--config', f.configPath], f.run, () => {}),
				/Groups|Options/
			);
			assert.equal(
				f.calls.some((call) => call.args[0] === 'stack' && call.args[1] === 'deploy'),
				false
			);
			assert.equal(existsSync(join(f.dir, 'state/previous.json')), false);
		} finally {
			f.cleanup();
		}
	}
});

test('dry-run reports invalid generated stack instead of success', async () => {
	const f = fixture();
	try {
		f.failSchema('apps');
		await assert.rejects(
			main(['--config', f.configPath, '--dry-run'], f.run, (line) => f.logs.push(line)),
			/stack 설정 검증/
		);
		assert.equal(
			f.calls.some((call) => call.args[0] === 'stack' && call.args[1] === 'deploy'),
			false
		);
		assert.equal(
			f.logs.some((line) => line.includes('dry-run 완료')),
			false
		);
		assert.equal(existsSync(join(f.dir, 'state')), false);
	} finally {
		f.cleanup();
	}
});

test('both app and infra schemas are checked before any update with --with-infra', async () => {
	for (const failingStack of ['apps', 'infra']) {
		const f = fixture();
		try {
			const settings = JSON.parse(readFileSync(f.configPath, 'utf8'));
			writeFileSync(f.configPath, JSON.stringify({ ...settings, infraStack: 'infra' }));
			for (const app of ['redis', 'postgres']) {
				const item = service(app, 'infra');
				item.Spec.TaskTemplate.ContainerSpec.Mounts = [{ Type: 'volume', Source: `existing-${app}`, Target: '/data' }];
				item.Spec.TaskTemplate.ContainerSpec.Env.push('PGDATA=/data');
				f.items[app] = item;
			}
			f.failSchema(failingStack);
			await assert.rejects(
				main(['--config', f.configPath, '--with-infra'], f.run, () => {}),
				/stack 설정 검증/
			);
			assert.equal(
				f.calls.some((call) => call.args[0] === 'stack' && call.args[1] === 'deploy'),
				false
			);
			assert.equal(existsSync(join(f.dir, 'state/previous.json')), false);
			assert.equal(existsSync(join(f.dir, 'state/pending.json')), false);
			const validations = f.calls.filter((call) => call.args[0] === 'stack' && call.args[1] === 'config');
			assert.equal(validations.length, failingStack === 'apps' ? 1 : 2);
		} finally {
			f.cleanup();
		}
	}
});
test('tmpfs security flags stop normal deploy and dry-run before snapshots or updates', async () => {
	for (const dryRun of [false, true]) {
		const f = fixture();
		try {
			f.items.bot.Spec.TaskTemplate.ContainerSpec.Mounts = [
				{ Type: 'tmpfs', Target: '/scratch', TmpfsOptions: { Options: [['noexec'], ['nosuid']] } }
			];
			await assert.rejects(
				main(['--config', f.configPath, ...(dryRun ? ['--dry-run'] : [])], f.run, () => {}),
				/TmpfsOptions.*Options/
			);
			assert.equal(
				f.calls.some((call) => call.args[0] === 'stack' && call.args[1] === 'deploy'),
				false
			);
			assert.equal(existsSync(join(f.dir, 'state/previous.json')), false);
			assert.equal(existsSync(join(f.dir, 'state/pending.json')), false);
		} finally {
			f.cleanup();
		}
	}
});
test('platform scheduling filters are retained across deployment, no-op and rollback', async () => {
	const f = fixture();
	try {
		const platforms = [{ Architecture: 'arm64', OS: 'linux' }];
		f.items.bot.Spec.TaskTemplate.Placement.Platforms = structuredClone(platforms);
		await main(['--config', f.configPath], f.run, () => {});
		assert.deepEqual(f.items.bot.Spec.TaskTemplate.Placement.Platforms, platforms);
		const serviceCalls = () => f.calls.filter((c) => c.args[0] === 'service' && c.args[1] === 'update');
		assert.equal(serviceCalls().length, 1);
		assert.ok(serviceCalls()[0].args.includes('--no-resolve-image'));
		assert.ok(serviceCalls()[0].args.includes('--with-registry-auth'));
		assert.equal(
			serviceCalls()[0].args.some((v) => v.includes(common.AUTH_KEY)),
			false
		);
		assert.equal(serviceCalls()[0].opts.env.AUTH_KEY, common.AUTH_KEY);
		const appStack = f.calls.find((c) => c.args[0] === 'stack' && c.args[1] === 'deploy');
		assert.equal(Object.hasOwn(JSON.parse(appStack.opts.input).services, 'bot'), false);
		await main(['--config', f.configPath], f.run, () => {});
		assert.equal(serviceCalls().length, 1);
		await main(['rollback', '--config', f.configPath], f.run, () => {});
		assert.equal(serviceCalls().length, 2);
		assert.deepEqual(f.items.bot.Spec.TaskTemplate.ContainerSpec.Env, ['KEEP=original']);
		assert.deepEqual(f.items.bot.Spec.TaskTemplate.Placement.Platforms, platforms);
	} finally {
		f.cleanup();
	}
});
test('rollback refuses externally changed platform filters before applying any service update', async () => {
	const f = fixture();
	try {
		f.items.bot.Spec.TaskTemplate.Placement.Platforms = [{ Architecture: 'arm64', OS: 'linux' }];
		await main(['--config', f.configPath], f.run, () => {});
		f.items.bot.Spec.TaskTemplate.Placement.Platforms = [{ Architecture: 'amd64', OS: 'linux' }];
		const count = f.calls.length;
		await assert.rejects(
			main(['rollback', '--config', f.configPath], f.run, () => {}),
			/Platforms/
		);
		assert.equal(
			f.calls.slice(count).some((c) => (c.args[0] === 'stack' && c.args[1] === 'deploy') || (c.args[0] === 'service' && c.args[1] === 'update')),
			false
		);
	} finally {
		f.cleanup();
	}
});
test('platform-safe updates reject changes outside their supported flags or Docker CLI environment', () => {
	const before = composeService(service('bot').Spec, refs);
	const desired = structuredClone(before);
	desired.ports = [{ target: 8080, published: 18080 }];
	assert.throws(() => platformUpdatePlan(before, desired, 'test_bot'), /Platforms/);
	desired.ports = before.ports;
	desired.environment.DOCKER_HOST = 'tcp://different-manager:2375';
	assert.throws(() => platformUpdatePlan(before, desired, 'test_bot'), /CLI 환경/);
});
test('named endpoint ports stop deploy, dry-run and rollback before snapshots or updates', async () => {
	for (const action of [[], ['--dry-run'], ['rollback']]) {
		const f = fixture();
		try {
			f.items.bot.Spec.EndpointSpec = { Ports: [{ Name: 'http', TargetPort: 8080, Protocol: 'tcp', PublishMode: 'ingress' }] };
			await assert.rejects(
				main([...action, '--config', f.configPath], f.run, () => {}),
				/EndpointSpec.Ports.*Name/
			);
			assert.equal(
				f.calls.some((c) => (c.args[0] === 'stack' && c.args[1] === 'deploy') || (c.args[0] === 'service' && c.args[1] === 'update')),
				false
			);
			assert.equal(existsSync(join(f.dir, 'state/previous.json')), false);
			assert.equal(existsSync(join(f.dir, 'state/pending.json')), false);
		} finally {
			f.cleanup();
		}
	}
});
for (const restricted of [false, true]) {
	test(`explicit zero stop grace survives deployment, no-op and rollback (platform filter: ${restricted})`, async () => {
		const f = fixture();
		try {
			for (const app of APPS) f.items[app].Spec.TaskTemplate.ContainerSpec.StopGracePeriod = 0;
			if (restricted) f.items.dashboard.Spec.TaskTemplate.Placement.Platforms = [{ Architecture: 'amd64', OS: 'linux' }];
			const updates = () =>
				f.calls.filter((c) => (c.args[0] === 'stack' && c.args[1] === 'deploy') || (c.args[0] === 'service' && c.args[1] === 'update'));
			await main(['--config', f.configPath], f.run, () => {});
			for (const app of APPS) assert.equal(f.items[app].Spec.TaskTemplate.ContainerSpec.StopGracePeriod, app === 'bot' ? 30e9 : 0);
			const previous = JSON.parse(readFileSync(join(f.dir, 'state/previous.json'), 'utf8'));
			for (const app of APPS) assert.equal(previous.stack.services[app].stop_grace_period, '0ns');
			const count = updates().length;
			await main(['--config', f.configPath], f.run, () => {});
			assert.equal(updates().length, count);
			await main(['rollback', '--config', f.configPath], f.run, () => {});
			for (const app of APPS) assert.equal(f.items[app].Spec.TaskTemplate.ContainerSpec.StopGracePeriod, 0);
		} finally {
			f.cleanup();
		}
	});
}
for (const phase of ['infra-apply', 'infra-convergence', 'infra-noop', 'app-convergence']) {
	test(`failure diagnostics identify the active stack and redact infrastructure secrets (${phase})`, async () => {
		const f = fixture();
		try {
			const settings = JSON.parse(readFileSync(f.configPath, 'utf8'));
			writeFileSync(f.configPath, JSON.stringify({ ...settings, infraStack: 'infra' }));
			const infraSecret = 'q7!';
			for (const app of ['redis', 'postgres']) {
				const item = service(app, 'infra');
				item.Spec.TaskTemplate.ContainerSpec.Mounts = [{ Type: 'volume', Source: `existing-${app}`, Target: '/data' }];
				item.Spec.TaskTemplate.ContainerSpec.Env.push('PGDATA=/data', `INFRA_PASSWORD=${infraSecret}`);
				if (phase === 'infra-noop') item.Spec.TaskTemplate.Placement.Constraints.push('node.id == node-id');
				f.items[app] = item;
			}
			if (phase === 'infra-noop') f.items.redis.UpdateStatus = { State: 'paused' };
			const diagnosed = [];
			const logs = [];
			const run = (program, args, opts) => {
				if (args[0] === 'service' && args[1] === 'ps' && args.includes('--format')) {
					diagnosed.push(args.at(-1));
					return `${args.at(-1)}.1 | Failed | ${infraSecret} ${common.AUTH_KEY}`;
				}
				const result = f.run(program, args, opts);
				if (args[0] === 'stack' && args[1] === 'deploy') {
					if (phase === 'infra-apply' && args.at(-1) === 'infra') throw new Error('infrastructure apply failed');
					if (phase === 'infra-convergence' && args.at(-1) === 'infra') f.items.redis.UpdateStatus = { State: 'paused' };
					if (phase === 'app-convergence' && args.at(-1) === 'test') f.items.bot.UpdateStatus = { State: 'paused' };
				}
				return result;
			};
			await assert.rejects(
				main(['--config', f.configPath, '--with-infra'], run, (line) => logs.push(line)),
				/업데이트 중단|apply failed/
			);
			assert.deepEqual(diagnosed, phase === 'app-convergence' ? APPS.map((app) => `test_${app}`) : ['infra_redis', 'infra_postgres']);
			assert.equal(logs.join('\n').includes(infraSecret), false);
			assert.equal(logs.join('\n').includes(common.AUTH_KEY), false);
			assert.ok(logs.join('\n').includes('[redacted]'));
			if (phase !== 'app-convergence')
				assert.equal(
					f.calls.some((c) => c.args[0] === 'stack' && c.args[1] === 'deploy' && c.args.at(-1) === 'test'),
					false
				);
		} finally {
			f.cleanup();
		}
	});
}
for (const credential of ['q', 'q7', 'q7!']) {
	test(`failure diagnostics redact a ${credential.length}-character environment credential`, async () => {
		const f = fixture();
		try {
			writeFileSync(join(f.dir, '.env'), readFileSync(join(f.dir, '.env'), 'utf8') + `\nAUTH_KEY=${credential}\n`);
			f.failDeploy(true);
			const logs = [];
			const run = (program, args, opts) =>
				args[0] === 'service' && args[1] === 'ps' && args.includes('--format')
					? `${args.at(-1)}.1 | failed | credential=${credential}`
					: f.run(program, args, opts);
			await assert.rejects(
				main(['--config', f.configPath], run, (line) => logs.push(line)),
				/update failed/
			);
			assert.ok(logs.includes('test_bot.1 | failed | credential=[redacted]'));
			assert.equal(logs.join('\n').includes(credential), false);
		} finally {
			f.cleanup();
		}
	});
}
test('rollback failure diagnostics redact credentials present only in the saved configuration', async () => {
	const f = fixture();
	try {
		f.items.bot.Spec.TaskTemplate.ContainerSpec.Env.push('AUTH_KEY=q7');
		await main(['--config', f.configPath], f.run, () => {});
		f.failDeploy(true);
		const logs = [];
		const run = (program, args, opts) =>
			args[0] === 'service' && args[1] === 'ps' && args.includes('--format')
				? `${args.at(-1)}.1 | failed | credential=q7`
				: f.run(program, args, opts);
		await assert.rejects(
			main(['rollback', '--config', f.configPath], run, (line) => logs.push(line)),
			/update failed/
		);
		assert.ok(logs.includes('test_bot.1 | failed | credential=[redacted]'));
		assert.equal(logs.join('\n').includes('q7'), false);
	} finally {
		f.cleanup();
	}
});
test('redaction covers short, overlapping and repeated values and treats regex syntax literally', () => {
	assert.equal(redactValues('q q7 q7! q7! [a-z]+', ['', 'q', 'q7', 'q7!', '[a-z]+', 'q']), '[redacted] [redacted] [redacted] [redacted] [redacted]');
	assert.equal(redactValues('a.b aXb', ['a.b']), '[redacted] aXb');
});
test('redaction never rewrites markers with later short sensitive values', () => {
	assert.equal(redactValues('secret d', ['secret', 'd']), '[redacted] [redacted]');
});
test('redaction ignores empty values without changing ordinary output', () => {
	assert.equal(redactValues('service ready', ['', '']), 'service ready');
	assert.equal(redactValues('service ready', []), 'service ready');
});
