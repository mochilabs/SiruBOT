// Run only against two disposable Docker-in-Docker daemons, never a production swarm.
// SIRUBOT_SWARM_TEST_MANAGER=<dind name> SIRUBOT_SWARM_TEST_WORKER=<dind name>
// node --test scripts/deploy.swarm.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { containerFingerprint, main, waitForServices } from './deploy.mjs';
import { APPS } from './deployment-manifest.mjs';

const manager = process.env.SIRUBOT_SWARM_TEST_MANAGER;
const worker = process.env.SIRUBOT_SWARM_TEST_WORKER;

test(
	'two-node Swarm: host mappings, scale, no-op, automatic recovery, rollback and storage identity',
	{
		skip: !manager || !worker,
		timeout: 600_000
	},
	async () => {
		const docker = (program, args, options = {}) => {
			assert.equal(program, 'docker');
			if (args[0] === 'manifest' && process.env.SIRUBOT_SWARM_TEST_INSECURE === 'true') args = [...args.slice(0, 2), '--insecure', ...args.slice(2)];
			return execFileSync('docker', ['exec', '-i', manager, 'docker', ...args], {
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe'],
				timeout: 60_000,
				...options
			}).trim();
		};
		for (const name of [manager, worker]) {
			const container = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' }))[0];
			assert.match(container.Config.Image, /^docker:.*dind$/);
			assert.equal(container.HostConfig.Privileged, true);
			assert.equal(
				container.Mounts.some((mount) => mount.Source === '/var/run/docker.sock'),
				false
			);
		}
		const dir = mkdtempSync(join(tmpdir(), 'sirubot-swarm-'));
		const suffix = `${process.pid}-${Date.now()}`;
		const appStack = `app-${suffix}`;
		const infraStack = `infra-${suffix}`;
		const network = `network-${suffix}`;
		const volumes = [`redis-${suffix}`, `postgres-${suffix}`];
		const configPath = join(dir, 'config.json');
		const settings = {
			repository: 'mochilabs/SiruBOT',
			branch: 'beta',
			appStack,
			infraStack,
			envFile: './.env',
			timeoutSeconds: 100,
			pollSeconds: 0.5,
			stabilitySeconds: 5
		};
		writeFileSync(configPath, JSON.stringify(settings));
		writeFileSync(
			join(dir, '.env'),
			[
				'DISCORD_TOKEN=test-discord',
				'DATABASE_URL=postgresql://test/db',
				'REDIS_URL=redis://test',
				'LAVALINK_HOSTS=main_test_2333',
				'AUTH_KEY="literal $HOME $(do-not-run)"',
				'AUTH_DISCORD_ID=123',
				'AUTH_DISCORD_SECRET=test-oauth',
				'AUTH_SECRET=test-session'
			].join('\n')
		);
		const image = process.env.SIRUBOT_SWARM_TEST_IMAGE ?? JSON.parse(docker('docker', ['image', 'inspect', 'node:22-alpine']))[0].RepoDigests[0];
		const manifest = { runId: 1, commit: 'a'.repeat(40), images: Object.fromEntries(APPS.map((app) => [app, image])) };
		const applications = Object.fromEntries(
			APPS.map((app) => [
				app,
				{
					image,
					entrypoint: ['node'],
					command: [
						'-e',
						"if(process.env.FAIL_START==='true')process.exit(1);const s=require('http').createServer((q,r)=>r.end('ok'));s.listen(8080,'0.0.0.0');process.once('SIGTERM',()=>s.close(()=>process.exit(0)))"
					],
					environment: { KEEP: 'original', PORT: '8080' },
					extra_hosts: ['upstream.test:192.0.2.1', 'ipv6.test:2001:db8::1'],
					networks: { shared: { aliases: [app] } },
					healthcheck: {
						test: [
							'CMD',
							'node',
							'-e',
							"require('http').get('http://localhost:8080',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
						],
						interval: '5s',
						timeout: '5s',
						start_period: '3s',
						retries: 5
					},
					stop_grace_period: '30s',
					deploy: {
						replicas: app === 'bot' ? 2 : 1,
						placement: { constraints: ['node.role == worker'] },
						update_config: { order: 'stop-first', parallelism: 1, monitor: '2s', failure_action: 'rollback' }
					}
				}
			])
		);
		const infrastructure = Object.fromEntries(
			['redis', 'postgres'].map((app, i) => [
				app,
				{
					image,
					entrypoint: ['node'],
					command: [
						'-e',
						`const f=require('fs');if(!f.existsSync('/data/marker'))f.writeFileSync('/data/marker','original-${app}');setInterval(()=>{},1000);process.once('SIGTERM',()=>process.exit(0))`
					],
					environment: { PGDATA: '/data' },
					volumes: [{ type: 'volume', source: app, target: '/data' }],
					networks: ['shared'],
					deploy: { replicas: 1, placement: { constraints: ['node.role == worker'] } }
				}
			])
		);
		const ids = () =>
			Object.fromEntries(
				APPS.map((app) => [app, docker('docker', ['service', 'ps', '-q', '--filter', 'desired-state=running', `${appStack}_${app}`])])
			);
		const logs = [];
		try {
			docker('docker', ['network', 'create', '--driver', 'overlay', '--attachable', network]);
			for (const volume of volumes) execFileSync('docker', ['exec', worker, 'docker', 'volume', 'create', volume], { stdio: 'pipe' });
			const networks = { shared: { external: { name: network } } };
			docker('docker', ['stack', 'deploy', '--resolve-image', 'never', '-c', '-', appStack], {
				input: JSON.stringify({ version: '3.8', services: applications, networks })
			});
			docker('docker', ['stack', 'deploy', '--resolve-image', 'never', '-c', '-', infraStack], {
				input: JSON.stringify({
					version: '3.8',
					services: infrastructure,
					networks,
					volumes: Object.fromEntries(['redis', 'postgres'].map((app, i) => [app, { external: { name: volumes[i] } }]))
				})
			});
			await waitForServices(
				APPS.map((app) => `${appStack}_${app}`),
				settings,
				docker
			);
			await waitForServices(
				['redis', 'postgres'].map((app) => `${infraStack}_${app}`),
				settings,
				docker
			);
			const storageNode = JSON.parse(docker('docker', ['service', 'ps', '--format', '{{json .}}', `${infraStack}_postgres`]).split('\n')[0]).Node;
			await main(
				['--config', configPath],
				docker,
				(line) => logs.push(line),
				() => manifest
			);
			const services = JSON.parse(docker('docker', ['service', 'inspect', ...APPS.map((app) => `${appStack}_${app}`)]));
			const bot = services.find((item) => item.Spec.Name.endsWith('_bot'));
			assert.equal(bot.Spec.Mode.Replicated.Replicas, 2);
			assert.deepEqual(bot.Spec.TaskTemplate.Placement.Constraints, ['node.role == worker']);
			assert.deepEqual([...bot.Spec.TaskTemplate.ContainerSpec.Hosts].sort(), ['192.0.2.1 upstream.test', '2001:db8::1 ipv6.test'].sort());
			assert.ok(bot.Spec.TaskTemplate.ContainerSpec.Env.includes('AUTH_KEY=literal $HOME $(do-not-run)'));
			console.log('Application deployment converged; checking no-op and infrastructure');
			const firstIds = ids();
			await main(
				['--config', configPath],
				docker,
				() => {},
				() => manifest
			);
			assert.deepEqual(ids(), firstIds);
			await main(
				['--config', configPath, '--with-infra'],
				docker,
				() => {},
				() => manifest
			);
			assert.deepEqual(ids(), firstIds);
			const postgres = JSON.parse(docker('docker', ['service', 'inspect', `${infraStack}_postgres`]))[0];
			assert.ok(postgres.Spec.TaskTemplate.Placement.Constraints.some((value) => value.startsWith('node.id ==')));
			assert.equal(postgres.Spec.TaskTemplate.ContainerSpec.Mounts[0].Source, volumes[1]);
			assert.equal(
				JSON.parse(docker('docker', ['service', 'ps', '--format', '{{json .}}', `${infraStack}_postgres`]).split('\n')[0]).Node,
				storageNode
			);
			const containerId = execFileSync(
				'docker',
				['exec', worker, 'docker', 'ps', '-q', '--filter', `label=com.docker.swarm.service.name=${infraStack}_postgres`],
				{ encoding: 'utf8' }
			).trim();
			assert.equal(
				execFileSync('docker', ['exec', worker, 'docker', 'exec', containerId, 'cat', '/data/marker'], { encoding: 'utf8' }).trim(),
				'original-postgres'
			);
			await main(['rollback', '--config', configPath], docker, () => {});
			const restored = JSON.parse(docker('docker', ['service', 'inspect', `${appStack}_bot`]))[0];
			assert.deepEqual(restored.Spec.TaskTemplate.ContainerSpec.Env.sort(), ['KEEP=original', 'PORT=8080']);
			assert.deepEqual([...restored.Spec.TaskTemplate.ContainerSpec.Hosts].sort(), ['192.0.2.1 upstream.test', '2001:db8::1 ipv6.test'].sort());
			assert.equal(logs.join('\n').includes('literal $HOME'), false);
			console.log('Host mappings and regular rollback verified; exercising Swarm automatic recovery');
			const originalEnv = readFileSync(join(dir, '.env'), 'utf8');
			writeFileSync(join(dir, '.env'), `${originalEnv}\nFAIL_START=true\n`);
			await assert.rejects(
				main(
					['--config', configPath],
					docker,
					() => {},
					() => manifest
				),
				/자동 rollback|시간 초과/
			);
			assert.equal(existsSync(join(dir, 'state/pending.json')), true);
			const deadline = Date.now() + settings.timeoutSeconds * 1000;
			let recovered;
			while (Date.now() < deadline) {
				recovered = JSON.parse(docker('docker', ['service', 'inspect', ...APPS.map((app) => `${appStack}_${app}`)]));
				if (recovered.every((item) => item.UpdateStatus?.State === 'rollback_completed')) break;
				await new Promise((done) => setTimeout(done, 500));
			}
			assert.ok(recovered.every((item) => item.UpdateStatus?.State === 'rollback_completed'));
			for (const item of recovered) {
				const taskIds = docker('docker', ['service', 'ps', '-q', '--filter', 'desired-state=running', item.ID]).split('\n').filter(Boolean);
				const running = JSON.parse(docker('docker', ['inspect', '--type', 'task', ...taskIds]));
				for (const task of running) {
					const target = item.Spec.TaskTemplate.ContainerSpec;
					const actual = task.Spec.ContainerSpec;
					assert.equal(containerFingerprint(actual), containerFingerprint(target), `${item.Spec.Name}: restored task configuration must match`);
				}
			}
			await main(['rollback', '--config', configPath], docker, () => {});
			assert.equal(existsSync(join(dir, 'state/pending.json')), false);
			const afterRecovery = JSON.parse(docker('docker', ['service', 'inspect', `${appStack}_bot`]))[0];
			assert.equal(afterRecovery.UpdateStatus.State, 'rollback_completed');
			assert.deepEqual(afterRecovery.Spec.TaskTemplate.ContainerSpec.Env.sort(), ['KEEP=original', 'PORT=8080']);
			writeFileSync(join(dir, '.env'), `${originalEnv}\nFAIL_START=false\n`);
			manifest.runId = 2;
			manifest.commit = 'b'.repeat(40);
			await main(
				['--config', configPath],
				docker,
				() => {},
				() => manifest
			);
			assert.equal(existsSync(join(dir, 'state/pending.json')), false);
			const deployed = JSON.parse(docker('docker', ['service', 'inspect', `${appStack}_bot`]))[0];
			assert.ok(deployed.Spec.TaskTemplate.ContainerSpec.Env.includes('FAIL_START=false'));
		} finally {
			for (const stack of [appStack, infraStack]) {
				try {
					docker('docker', ['stack', 'rm', stack]);
				} catch {}
			}
			// Let asynchronous task shutdown finish before deleting only this test's resources.
			for (let i = 0; i < 30; i++) {
				try {
					docker('docker', ['network', 'rm', network]);
					break;
				} catch {
					await new Promise((done) => setTimeout(done, 500));
				}
			}
			for (const volume of volumes) {
				try {
					execFileSync('docker', ['exec', worker, 'docker', 'volume', 'rm', volume], { stdio: 'pipe' });
				} catch {}
			}
			rmSync(dir, { recursive: true, force: true });
		}
	}
);
