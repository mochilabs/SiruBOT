#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, openSync, closeSync, chmodSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { APPS, command, selectManifest } from './deployment-manifest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export function options(argv) {
	const result = {
		action: 'deploy',
		config: join(ROOT, '.deploy/config.json'),
		dryRun: false,
		withInfra: false
	};
	if (['status', 'rollback'].includes(argv[0])) result.action = argv.shift();
	while (argv.length) {
		const arg = argv.shift();
		if (arg === '--dry-run') result.dryRun = true;
		else if (arg === '--with-infra') result.withInfra = true;
		else if (['--config', '--run'].includes(arg)) {
			const value = argv.shift();
			if (!value || value.startsWith('--')) throw new Error(`${arg} 값을 지정하세요.`);
			if (arg === '--config') result.config = resolve(value);
			else if (!/^[1-9]\d*$/.test(value)) throw new Error('CI 실행 번호는 양의 정수여야 합니다.');
			else result.runId = value;
		} else if (arg === '--help') result.help = true;
		else throw new Error(`알 수 없는 옵션: ${arg}`);
	}
	if (result.action !== 'deploy' && (result.withInfra || result.runId)) throw new Error('인프라·CI 실행 옵션은 deploy에만 사용할 수 있습니다.');
	return result;
}

export function loadConfig(path) {
	let config;
	try {
		config = JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		throw new Error('배포 설정을 읽을 수 없습니다. docker/deploy.config.example.json을 .deploy/config.json에 복사해 설정하세요.');
	}
	if (
		!/^[\w.-]+\/[\w.-]+$/.test(config.repository ?? '') ||
		typeof config.branch !== 'string' ||
		!config.branch ||
		!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(config.appStack ?? '') ||
		typeof config.envFile !== 'string'
	) {
		throw new Error('repository, branch, appStack, envFile 설정을 확인하세요.');
	}
	if (config.infraStack && (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(config.infraStack) || config.infraStack === config.appStack)) {
		throw new Error('infraStack은 앱과 구분된 기존 stack 이름이어야 합니다.');
	}
	for (const key of ['timeoutSeconds', 'pollSeconds', 'stabilitySeconds']) {
		if (config[key] !== undefined && (!Number.isFinite(config[key]) || config[key] <= 0)) throw new Error(`${key}는 양수여야 합니다.`);
	}
	return {
		timeoutSeconds: 600,
		pollSeconds: 5,
		stabilitySeconds: 30,
		...config,
		envFile: resolve(dirname(path), config.envFile),
		stateDir: resolve(dirname(path), config.stateDir ?? 'state')
	};
}

function requireKeys(env, keys) {
	const missing = keys.filter((key) => !env[key]?.trim());
	if (missing.length) throw new Error(`필수 환경 변수 누락: ${missing.join(', ')}`);
}

export function environments(common, config, originals) {
	requireKeys(common, ['DISCORD_TOKEN', 'DATABASE_URL', 'REDIS_URL', 'LAVALINK_HOSTS', 'AUTH_KEY', 'AUTH_DISCORD_ID', 'AUTH_DISCORD_SECRET']);
	if (!common.AUTH_SECRET && !common.NEXTAUTH_SECRET) throw new Error('AUTH_SECRET 또는 NEXTAUTH_SECRET이 필요합니다.');
	const botUrl = config.botShardManagerUrl ?? 'ws://shardmanager:3001/ws';
	const dashboardUrl = config.dashboardShardManagerUrl ?? 'http://shardmanager:3001';
	const dataUrl = config.dataApiUrl ?? 'http://data-api:3002';
	for (const [value, protocols, ws] of [
		[botUrl, ['ws:', 'wss:'], true],
		[dashboardUrl, ['http:', 'https:'], false],
		[dataUrl, ['http:', 'https:'], false]
	]) {
		let url;
		try {
			url = new URL(value);
		} catch {
			throw new Error('내부 서비스 URL 형식이 올바르지 않습니다.');
		}
		if (!protocols.includes(url.protocol) || (ws && !url.pathname.endsWith('/ws')))
			throw new Error('봇은 /ws WS 주소, 웹은 HTTP 주소를 사용해야 합니다.');
	}
	const result = {};
	for (const app of APPS) result[app] = { ...originals[app], ...common, NODE_ENV: 'production' };
	Object.assign(result.bot, {
		LOGLEVEL: common.LOGLEVEL ?? originals.bot?.LOGLEVEL ?? '3',
		SHARD_MANAGER_URL: botUrl,
		DATA_API_URL: dataUrl,
		DATA_API_AUTH_KEY: common.AUTH_KEY
	});
	Object.assign(result.shardmanager, {
		HOSTNAME: '0.0.0.0',
		PORT: originals.shardmanager?.PORT ?? '3001'
	});
	Object.assign(result.dashboard, {
		HOSTNAME: '0.0.0.0',
		SHARD_MANAGER_URL: dashboardUrl,
		SHARD_MANAGER_AUTH_KEY: common.AUTH_KEY,
		DATA_API_URL: dataUrl,
		DATA_API_AUTH_KEY: common.AUTH_KEY
	});
	Object.assign(result['data-api'], {
		HOSTNAME: '0.0.0.0',
		PORT: originals['data-api']?.PORT ?? '3002'
	});
	return result;
}

const ns = (value) => `${value}ns`;
const empty = (value) => value === undefined || value === null || (typeof value === 'object' && Object.keys(value).length === 0);
function supported(object, keys, context) {
	for (const [key, value] of Object.entries(object ?? {})) {
		if (!keys.includes(key) && !empty(value)) throw new Error(`${context}: 보존할 수 없는 설정 ${key}. 수동 변경 없이 배포를 중단합니다.`);
	}
}
function envObject(values = []) {
	return Object.fromEntries(
		values.map((value) => {
			const i = value.indexOf('=');
			return [value.slice(0, i), value.slice(i + 1)];
		})
	);
}
function extraHosts(values, context) {
	if (values === undefined) return undefined;
	const mappings = new Map();
	for (const value of values ?? []) {
		const [address, ...hostnames] = value.trim().split(/\s+/);
		if (!address || !hostnames.length) throw new Error(`${context}: Hosts 매핑은 IP와 hostname을 포함해야 합니다.`);
		for (const hostname of hostnames) {
			if (mappings.has(hostname) && mappings.get(hostname) !== address)
				throw new Error(`${context}: 같은 hostname의 여러 IP는 Compose에서 보존할 수 없습니다.`);
			mappings.set(hostname, address);
		}
	}
	return [...mappings].map(([hostname, address]) => `${hostname}:${address}`).sort();
}
function updatePolicy(policy) {
	if (!policy) return undefined;
	supported(policy, ['Parallelism', 'Delay', 'FailureAction', 'Monitor', 'MaxFailureRatio', 'Order'], 'update policy');
	return {
		parallelism: policy.Parallelism,
		delay: ns(policy.Delay ?? 0),
		failure_action: policy.FailureAction,
		monitor: ns(policy.Monitor ?? 0),
		max_failure_ratio: policy.MaxFailureRatio,
		order: policy.Order
	};
}

// Export only settings represented by legacy Compose v3. Reject unsupported settings before any update.
// The live services are the source of truth; repository defaults never reset an operator's placement or scale.
export function composeService(spec, references, { retainPlatforms = false } = {}) {
	supported(spec, ['Name', 'Labels', 'TaskTemplate', 'Mode', 'UpdateConfig', 'RollbackConfig', 'EndpointSpec'], spec.Name);
	const task = spec.TaskTemplate;
	supported(task, ['ContainerSpec', 'Resources', 'RestartPolicy', 'Placement', 'Networks', 'LogDriver', 'ForceUpdate', 'Runtime'], spec.Name);
	if (task.Runtime && task.Runtime !== 'container') throw new Error('container 서비스만 지원합니다.');
	if (task.ForceUpdate) throw new Error(`${spec.Name}: ForceUpdate가 설정되어 있습니다. stack 설정을 먼저 정규화하세요.`);
	const c = task.ContainerSpec;
	supported(
		c,
		[
			'Image',
			'Labels',
			'Command',
			'Args',
			'Hostname',
			'Env',
			'Dir',
			'User',
			'Privileges',
			'TTY',
			'OpenStdin',
			'ReadOnly',
			'Mounts',
			'StopSignal',
			'StopGracePeriod',
			'Healthcheck',
			'Hosts',
			'DNSConfig',
			'Secrets',
			'Configs',
			'Isolation',
			'Init',
			'Sysctls',
			'CapabilityAdd',
			'CapabilityDrop',
			'Ulimits'
		],
		spec.Name
	);
	supported(c.DNSConfig, ['Nameservers', 'Search'], `${spec.Name}/DNSConfig`);
	if (Object.values(c.Privileges ?? {}).some((value) => value !== false && !empty(value)))
		throw new Error(`${spec.Name}: 특수 권한 설정을 자동 변환할 수 없습니다.`);
	if (c.OpenStdin || (c.Isolation && c.Isolation !== 'default')) throw new Error(`${spec.Name}: stdin/isolation 설정을 자동 변환할 수 없습니다.`);
	if (!spec.Mode?.Replicated) throw new Error(`${spec.Name}: replicated 서비스만 지원합니다.`);
	supported(task.Placement, ['Constraints', 'Preferences', 'MaxReplicas', 'Platforms'], 'placement');
	if (!empty(task.Placement?.Platforms) && !retainPlatforms) throw new Error(`${spec.Name}: Platforms는 Compose에서 보존할 수 없습니다.`);
	supported(task.RestartPolicy, ['Condition', 'Delay', 'MaxAttempts', 'Window'], 'restart policy');
	supported(task.Resources, ['Limits', 'Reservations'], 'resources');
	const resources = {};
	for (const [source, target] of [
		['Limits', 'limits'],
		['Reservations', 'reservations']
	]) {
		const item = task.Resources?.[source];
		if (!empty(item)) {
			supported(item, ['NanoCPUs', 'MemoryBytes', 'Pids'], 'resources');
			resources[target] = {
				...(item.NanoCPUs ? { cpus: String(item.NanoCPUs / 1e9) } : {}),
				...(item.MemoryBytes ? { memory: String(item.MemoryBytes) } : {})
			};
			if (item.Pids) throw new Error('Pids 리소스 설정을 자동 변환할 수 없습니다.');
		}
	}
	const volumes = (c.Mounts ?? []).map((mount) => {
		supported(mount, ['Type', 'Source', 'Target', 'ReadOnly', 'Consistency', 'BindOptions', 'VolumeOptions', 'TmpfsOptions'], 'mount');
		if (!['volume', 'bind', 'tmpfs'].includes(mount.Type)) throw new Error('지원하지 않는 mount 종류입니다.');
		const result = {
			type: mount.Type,
			source: mount.Source,
			target: mount.Target,
			read_only: mount.ReadOnly,
			consistency: mount.Consistency
		};
		if (mount.Type === 'volume') {
			if (!mount.Source || !empty(mount.VolumeOptions?.DriverConfig) || !empty(mount.VolumeOptions?.Labels) || mount.VolumeOptions?.Subpath) {
				throw new Error('이름 없는 볼륨이나 특수 볼륨 설정은 자동 변환할 수 없습니다.');
			}
			result.source = references.volume(mount.Source);
			if (mount.VolumeOptions?.NoCopy !== undefined) result.volume = { nocopy: mount.VolumeOptions.NoCopy };
		} else if (mount.Type === 'bind' && mount.BindOptions) {
			supported(mount.BindOptions, ['Propagation', 'NonRecursive', 'CreateMountpoint', 'ReadOnlyNonRecursive', 'ReadOnlyForceRecursive'], 'bind');
			if (
				mount.BindOptions.NonRecursive ||
				mount.BindOptions.CreateMountpoint ||
				mount.BindOptions.ReadOnlyNonRecursive ||
				mount.BindOptions.ReadOnlyForceRecursive
			)
				throw new Error('특수 bind 설정은 지원하지 않습니다.');
			result.bind = { propagation: mount.BindOptions.Propagation };
		} else if (mount.Type === 'tmpfs' && mount.TmpfsOptions) {
			supported(mount.TmpfsOptions, ['SizeBytes', 'Mode'], `${spec.Name}/TmpfsOptions`);
			result.tmpfs = {
				size: mount.TmpfsOptions.SizeBytes,
				mode: mount.TmpfsOptions.Mode
			};
		}
		return result;
	});
	const networks = {};
	for (const net of task.Networks ?? []) {
		supported(net, ['Target', 'Aliases', 'DriverOpts'], 'network');
		if (!empty(net.DriverOpts)) throw new Error('network driver options를 자동 변환할 수 없습니다.');
		networks[references.network(net.Target)] = { aliases: [...new Set(net.Aliases ?? [])] };
	}
	const files = (items, kind) =>
		(items ?? []).map((item) => {
			if (!item.File) throw new Error(`${kind} file target만 지원합니다.`);
			return {
				source: references[kind](item[`${kind === 'secret' ? 'Secret' : 'Config'}ID`]),
				target: item.File.Name,
				uid: item.File.UID,
				gid: item.File.GID,
				mode: item.File.Mode
			};
		});
	supported(spec.EndpointSpec, ['Mode', 'Ports'], 'endpoint');
	const labels = { ...spec.Labels };
	delete labels['com.docker.stack.namespace'];
	delete labels['com.docker.stack.image'];
	supported(task.LogDriver, ['Name', 'Options'], 'logging');
	supported(c.Healthcheck, ['Test', 'Interval', 'Timeout', 'StartPeriod', 'Retries'], 'healthcheck');
	const restart = task.RestartPolicy;
	return {
		image: c.Image,
		entrypoint: c.Command,
		command: c.Args,
		hostname: c.Hostname,
		environment: envObject(c.Env),
		working_dir: c.Dir,
		user: c.User,
		tty: c.TTY,
		read_only: c.ReadOnly,
		init: c.Init,
		labels: c.Labels,
		...(task.LogDriver ? { logging: { driver: task.LogDriver.Name, options: task.LogDriver.Options } } : {}),
		stop_signal: c.StopSignal,
		...(c.StopGracePeriod ? { stop_grace_period: ns(c.StopGracePeriod) } : {}),
		...(c.Healthcheck
			? {
					healthcheck: {
						test: c.Healthcheck.Test,
						interval: ns(c.Healthcheck.Interval ?? 0),
						timeout: ns(c.Healthcheck.Timeout ?? 0),
						start_period: ns(c.Healthcheck.StartPeriod ?? 0),
						retries: c.Healthcheck.Retries ?? 0
					}
				}
			: {}),
		volumes,
		networks,
		secrets: files(c.Secrets, 'secret'),
		configs: files(c.Configs, 'config'),
		extra_hosts: extraHosts(c.Hosts, spec.Name),
		dns: c.DNSConfig?.Nameservers,
		dns_search: c.DNSConfig?.Search,
		sysctls: c.Sysctls,
		cap_add: c.CapabilityAdd,
		cap_drop: c.CapabilityDrop,
		ulimits: c.Ulimits ? Object.fromEntries(c.Ulimits.map((limit) => [limit.Name, { soft: limit.Soft, hard: limit.Hard }])) : undefined,
		ports: (spec.EndpointSpec?.Ports ?? []).map((port) => ({
			target: port.TargetPort,
			published: port.PublishedPort,
			protocol: port.Protocol,
			mode: port.PublishMode
		})),
		deploy: {
			labels,
			mode: 'replicated',
			replicas: spec.Mode.Replicated.Replicas,
			endpoint_mode: spec.EndpointSpec?.Mode,
			placement: {
				constraints: task.Placement?.Constraints ?? [],
				preferences: (task.Placement?.Preferences ?? []).map((item) => ({
					spread: item.Spread.SpreadDescriptor
				})),
				...(task.Placement?.MaxReplicas ? { max_replicas_per_node: task.Placement.MaxReplicas } : {})
			},
			resources,
			update_config: updatePolicy(spec.UpdateConfig),
			rollback_config: updatePolicy(spec.RollbackConfig),
			...(restart
				? {
						restart_policy: {
							condition: restart.Condition,
							delay: ns(restart.Delay ?? 0),
							max_attempts: restart.MaxAttempts ?? 0,
							window: ns(restart.Window ?? 0)
						}
					}
				: {})
		}
	};
}

export function canonical(value, field) {
	if (Array.isArray(value)) return value.map((item) => canonical(item, field));
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.filter((key) => value[key] !== undefined)
				.map((key) => [key, canonical(value[key], key)])
		);
	if (['image', 'Image'].includes(field) && typeof value === 'string' && value.includes('@sha256:'))
		return value.replace(/:[^/:@]+@sha256:/, '@sha256:');
	return value;
}
export const fingerprint = (value) =>
	createHash('sha256')
		.update(JSON.stringify(canonical(value)))
		.digest('hex');
export function containerFingerprint(value) {
	const spec = { ...value };
	const dns = Object.fromEntries(Object.entries(spec.DNSConfig ?? {}).filter(([, item]) => !empty(item)));
	if (Object.keys(dns).length) spec.DNSConfig = dns;
	else delete spec.DNSConfig;
	return fingerprint(spec);
}
export function escapeInterpolation(value) {
	if (Array.isArray(value)) return value.map(escapeInterpolation);
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, escapeInterpolation(item)]));
	return typeof value === 'string' ? value.replaceAll('$', () => '$$') : value;
}

function protectedWrite(path, object) {
	const temporary = `${path}.tmp`;
	writeFileSync(temporary, JSON.stringify(object, null, 2) + '\n', {
		mode: 0o600
	});
	chmodSync(temporary, 0o600);
	renameSync(temporary, path);
}

export function acquireLock(directory) {
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	const path = join(directory, 'lock');
	let fd;
	try {
		fd = openSync(path, 'wx', 0o600);
	} catch {
		throw new Error('배포 잠금이 있습니다. 실행 중인 배포를 확인하세요. 비정상 종료 후에는 state 디렉터리의 lock 파일을 직접 제거하세요.');
	}
	writeFileSync(fd, String(process.pid));
	return () => {
		closeSync(fd);
		rmSync(path, { force: true });
	};
}

function inspectServices(config, apps, stack, run) {
	const names = apps.map((app) => `${stack}_${app}`);
	const services = JSON.parse(run('docker', ['service', 'inspect', ...names]));
	if (services.length !== apps.length) throw new Error('기존 stack의 모든 서비스를 찾을 수 없습니다.');
	for (const service of services) {
		if (service.Spec.Labels?.['com.docker.stack.namespace'] !== stack) throw new Error('서비스가 지정한 stack에 속하지 않습니다.');
	}
	return Object.fromEntries(apps.map((app) => [app, services.find((service) => service.Spec.Name === `${stack}_${app}`)]));
}

function makeStack(services, run) {
	const result = {
		version: '3.8',
		services: {},
		networks: {},
		volumes: {},
		secrets: {},
		configs: {}
	};
	const reference = (kind, id) => {
		const key = `${kind}_${Object.keys(result[`${kind}s`]).length}`;
		const item = kind === 'volume' ? null : JSON.parse(run('docker', [kind, 'inspect', id]))[0];
		const actual = kind === 'volume' ? id : kind === 'network' ? item.Name : item.Spec.Name;
		const found = Object.keys(result[`${kind}s`]).find((item) => result[`${kind}s`][item].external.name === actual);
		if (found) return found;
		result[`${kind}s`][key] = { external: { name: actual } };
		return key;
	};
	const references = Object.fromEntries(['network', 'volume', 'secret', 'config'].map((kind) => [kind, (id) => reference(kind, id)]));
	// Platform-bearing services are never applied from this Compose representation:
	// preparePlatformUpdates retains their original spec with service update instead.
	for (const [app, service] of Object.entries(services)) result.services[app] = composeService(service.Spec, references, { retainPlatforms: true });
	return JSON.parse(JSON.stringify(result));
}

export function platformUpdatePlan(before, desired, name) {
	const fixedSettings = (service) => {
		const fixed = structuredClone(service);
		for (const key of ['image', 'environment', 'stop_grace_period']) delete fixed[key];
		delete fixed.deploy.replicas;
		delete fixed.deploy.placement.constraints;
		if (fixed.deploy.update_config) delete fixed.deploy.update_config.order;
		return fixed;
	};
	if (fingerprint(fixedSettings(before)) !== fingerprint(fixedSettings(desired)))
		throw new Error(`${name}: Platforms를 유지하는 service update로 복원할 수 없는 설정입니다.`);
	const args = ['service', 'update', '--detach', '--with-registry-auth', '--no-resolve-image'];
	const env = {};
	for (const [key, value] of Object.entries(desired.environment)) {
		if (before.environment[key] === value) continue;
		// Values travel in the child environment, never argv. Do not let application
		// variables change Docker transport, executable lookup or credential helpers.
		if (
			/^(DOCKER_|LD_|DYLD_|LC_)|^(PATH|HOME|USERPROFILE|APPDATA|XDG_CONFIG_HOME|SSH_AUTH_SOCK|NODE_OPTIONS|LANG|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)$/i.test(
				key
			)
		)
			throw new Error(`${name}: service update에서 CLI 환경과 충돌하는 변수 ${key}는 변경할 수 없습니다.`);
		args.push('--env-add', key);
		env[key] = value;
	}
	for (const key of Object.keys(before.environment)) if (!Object.hasOwn(desired.environment, key)) args.push('--env-rm', key);
	if (fingerprint({ image: before.image }) !== fingerprint({ image: desired.image })) args.push('--image', desired.image);
	if (before.stop_grace_period !== desired.stop_grace_period) args.push('--stop-grace-period', desired.stop_grace_period ?? '10s');
	if (before.deploy.replicas !== desired.deploy.replicas) args.push('--replicas', String(desired.deploy.replicas));
	const beforeConstraints = before.deploy.placement.constraints;
	const afterConstraints = desired.deploy.placement.constraints;
	for (const value of beforeConstraints) if (!afterConstraints.includes(value)) args.push('--constraint-rm', value);
	for (const value of afterConstraints) if (!beforeConstraints.includes(value)) args.push('--constraint-add', value);
	const beforeOrder = before.deploy.update_config?.order;
	const afterOrder = desired.deploy.update_config?.order;
	if (beforeOrder !== afterOrder) args.push('--update-order', afterOrder ?? 'stop-first');
	args.push('--label-add', `com.docker.stack.image=${desired.image}`, name);
	return { args, env };
}

function preparePlatformUpdates(current, before, desired, savedPlatforms) {
	const plans = {};
	for (const [app, service] of Object.entries(current)) {
		const platforms = service.Spec.TaskTemplate.Placement?.Platforms ?? [];
		if (savedPlatforms && fingerprint(platforms) !== fingerprint(savedPlatforms[app] ?? []))
			throw new Error(`${service.Spec.Name}: 저장된 Platforms와 현재 제한이 달라 자동 복원할 수 없습니다.`);
		if (!platforms.length) continue;
		const plan = platformUpdatePlan(before.services[app], desired.services[app], service.Spec.Name);
		if (fingerprint(before.services[app]) !== fingerprint(desired.services[app])) plans[app] = plan;
		else plans[app] = null;
	}
	return plans;
}

function applyStack(stack, name, plans, run) {
	const ordinary = structuredClone(stack);
	for (const app of Object.keys(plans)) delete ordinary.services[app];
	if (Object.keys(ordinary.services).length) deployStack(ordinary, name, run);
	for (const plan of Object.values(plans)) if (plan) run('docker', plan.args, { env: { ...process.env, ...plan.env } });
}

export function taskSummary(service, tasks, rollbackTargets = {}) {
	const update = service.UpdateStatus?.State;
	const restored = update === 'rollback_completed' && rollbackTargets[service.Spec.Name] === fingerprint(service.Spec);
	const active = tasks.filter((task) => task.DesiredState === 'running');
	const running = active.filter(
		(task) =>
			task.Status.State === 'running' &&
			(restored
				? containerFingerprint(task.Spec.ContainerSpec) === containerFingerprint(service.Spec.TaskTemplate.ContainerSpec)
				: task.Spec.ContainerSpec.Image === service.Spec.TaskTemplate.ContainerSpec.Image)
	);
	const expected = service.Spec.Mode.Replicated.Replicas;
	return {
		expected,
		running: running.length,
		ready: running.length === expected && active.length === expected && (!update || update === 'completed' || restored),
		failed: ['paused', 'rollback_paused'].includes(update) || (update === 'rollback_completed' && !restored)
	};
}

function tasksFor(service, run) {
	// Completed task history may be pruned between ps and inspect during a restart storm.
	for (let attempt = 0; attempt < 3; attempt++) {
		const ids = run('docker', ['service', 'ps', '-q', '--filter', 'desired-state=running', service.ID]).split('\n').filter(Boolean);
		if (!ids.length) return [];
		try {
			return JSON.parse(run('docker', ['inspect', '--type', 'task', ...ids]));
		} catch {}
	}
	return [];
}

export async function waitForServices(names, config, run = command, clock = Date.now, pause = sleep, rollbackTargets = {}) {
	const deadline = clock() + config.timeoutSeconds * 1000;
	let stableSince;
	let stableTasks;
	while (clock() < deadline) {
		const services = JSON.parse(run('docker', ['service', 'inspect', ...names]));
		let allReady = true;
		const taskIds = [];
		for (const service of services) {
			const tasks = tasksFor(service, run);
			const status = taskSummary(service, tasks, rollbackTargets);
			if (status.failed) throw new Error(`${service.Spec.Name}: Swarm 업데이트 중단 또는 자동 rollback이 감지됐습니다.`);
			allReady &&= status.ready;
			taskIds.push(...tasks.filter((task) => task.DesiredState === 'running').map((task) => task.ID));
		}
		const signature = taskIds.sort().join(',');
		if (allReady) {
			if (stableSince === undefined || signature !== stableTasks) {
				stableSince = clock();
				stableTasks = signature;
			}
			if (clock() - stableSince >= config.stabilitySeconds * 1000) return;
		} else stableSince = undefined;
		await pause(config.pollSeconds * 1000);
	}
	throw new Error('배포 상태 확인 시간 초과. service task 오류와 rollback 명령을 확인하세요.');
}

export function protectInfra(services, stack, run) {
	for (const [app, service] of Object.entries(services)) {
		if (service.Spec.Mode.Replicated.Replicas !== 1) throw new Error(`${app}: 데이터 서비스 replica가 1이 아닙니다.`);
		const tasks = tasksFor(service, run).filter((task) => task.DesiredState === 'running' && task.Status.State === 'running');
		if (tasks.length !== 1) throw new Error(`${app}: 실행 중인 저장 노드를 확정할 수 없습니다.`);
		const task = tasks[0];
		const mounts = service.Spec.TaskTemplate.ContainerSpec.Mounts ?? [];
		const container = service.Spec.TaskTemplate.ContainerSpec;
		const pgdata = envObject(container.Env).PGDATA;
		if (app === 'postgres' && !pgdata?.startsWith('/'))
			throw new Error('postgres: 현재 PGDATA를 서비스 환경에 명시해야 데이터 볼륨을 확인할 수 있습니다.');
		const dirIndex = (container.Args ?? []).indexOf('--dir');
		if (app === 'redis' && (container.Args ?? []).some((arg) => arg.endsWith('.conf')))
			throw new Error('redis: 외부 설정 파일의 데이터 경로는 자동 확인할 수 없습니다.');
		const dataPath = app === 'postgres' ? pgdata : dirIndex >= 0 ? container.Args[dirIndex + 1] : container.Dir || '/data';
		if (!dataPath?.startsWith('/')) throw new Error(`${app}: 절대 데이터 경로를 확정할 수 없습니다.`);
		const storage = mounts.find((mount) => dataPath === mount.Target || dataPath.startsWith(`${mount.Target}/`));
		if (!storage || storage.Type !== 'volume' || !storage.Source || storage.ReadOnly)
			throw new Error(`${app}: 기존 데이터 볼륨을 확정할 수 없습니다.`);
		if (fingerprint(mounts) !== fingerprint(task.Spec.ContainerSpec.Mounts ?? []))
			throw new Error(`${app}: 실행 task와 서비스의 볼륨 설정이 다릅니다.`);
		const node = JSON.parse(run('docker', ['node', 'inspect', task.NodeID]))[0];
		if (node.Status.State !== 'ready' || node.Spec.Availability !== 'active') throw new Error(`${app}: 저장 노드가 ready/active 상태가 아닙니다.`);
		// The running task proves the named mount is in use on this node. Do not probe by mounting:
		// Docker would silently create an empty volume if the name or node were wrong.
		if (!/@sha256:[a-f0-9]{64}$/.test(service.Spec.TaskTemplate.ContainerSpec.Image))
			throw new Error(`${app}: 현재 실행 이미지가 digest로 고정되어 있지 않습니다. 현재 이미지 digest를 먼저 고정하세요.`);
		const constraints = stack.services[app].deploy.placement.constraints;
		const otherNode = constraints.find((value) => value.startsWith('node.id ==') && value.split('==')[1].trim() !== task.NodeID);
		if (otherNode) throw new Error(`${app}: 현재 저장 노드와 배치 제약이 다릅니다.`);
		if (!constraints.includes(`node.id == ${task.NodeID}`)) constraints.push(`node.id == ${task.NodeID}`);
		stack.services[app].image = service.Spec.TaskTemplate.ContainerSpec.Image;
	}
	return stack;
}

function validateStack(stack, name, run) {
	try {
		// Validate with the same legacy schema/interpolation used by stack deploy.
		// Rendered stdout may contain credentials; capture and discard it.
		run('docker', ['stack', 'config', '--compose-file', '-'], { input: JSON.stringify(escapeInterpolation(stack)) });
	} catch {
		throw new Error(`${name}: Swarm stack 설정 검증에 실패했습니다. 서비스는 업데이트하지 않았습니다.`);
	}
}

function deployStack(stack, name, run) {
	// JSON is valid YAML. Escaping '$' preserves literal passwords through Compose interpolation.
	// Digests are already pinned and checked. Resolving again can add a new platform
	// filter to previously unrestricted services, so retain their empty filter too.
	run('docker', ['stack', 'deploy', '--with-registry-auth', '--resolve-image', 'never', '--compose-file', '-', name], {
		input: JSON.stringify(escapeInterpolation(stack))
	});
}

async function showStatus(config, run, log) {
	const services = inspectServices(config, APPS, config.appStack, run);
	for (const [app, service] of Object.entries(services)) {
		const status = taskSummary(service, tasksFor(service, run));
		log(`${app}: ${status.running}/${status.expected} ${service.UpdateStatus?.State ?? 'running'} ${service.Spec.TaskTemplate.ContainerSpec.Image}`);
	}
}

function diagnostics(config, run, log, redact) {
	for (const app of APPS) {
		try {
			const rows = run('docker', [
				'service',
				'ps',
				'--no-trunc',
				'--format',
				'{{.Name}} | {{.CurrentState}} | {{.Error}}',
				`${config.appStack}_${app}`
			]);
			log(redact(rows));
		} catch {
			log(`${app}: task 상태를 읽지 못했습니다.`);
		}
	}
	log('복원: node scripts/deploy.mjs rollback (DB migration과 인프라는 복원하지 않습니다.)');
}

export async function main(argv = process.argv.slice(2), run = command, log = console.log, manifestProvider = selectManifest) {
	const opts = options([...argv]);
	if (opts.help) {
		log('node scripts/deploy.mjs [status|rollback] [--config <path>] [--run <id>] [--with-infra] [--dry-run]');
		return;
	}
	const config = loadConfig(opts.config);
	const swarm = JSON.parse(run('docker', ['info', '--format', '{{json .Swarm}}']));
	if (!swarm.ControlAvailable || swarm.LocalNodeState !== 'active') throw new Error('현재 Docker 연결은 Swarm manager가 아닙니다.');
	if (opts.action === 'status') {
		await showStatus(config, run, log);
		return;
	}
	const releaseLock = opts.dryRun ? () => {} : acquireLock(config.stateDir);
	const clusterLocks = [];
	let updating = false;
	let sensitive = [];
	const redact = (message) => sensitive.reduce((value, secret) => (secret.length >= 4 ? value.replaceAll(secret, '[redacted]') : value), message);
	try {
		if (!opts.dryRun) {
			const stacks = opts.withInfra ? [config.appStack, config.infraStack].filter(Boolean).sort() : [config.appStack];
			for (const stack of stacks) {
				const name = `${stack}-deployment-lock`;
				try {
					const id = run('docker', ['config', 'create', '--label', 'sirubot.deployment.lock=true', name, '-'], {
						input: JSON.stringify({
							pid: process.pid,
							startedAt: new Date().toISOString()
						})
					});
					clusterLocks.push(id);
				} catch {
					throw new Error(`${name}: 다른 manager의 배포 잠금 또는 Docker config 생성 오류가 있습니다.`);
				}
			}
		}
		const current = inspectServices(config, APPS, config.appStack, run);
		const before = makeStack(current, run);
		sensitive = Object.values(before.services).flatMap((service) => Object.values(service.environment));
		let desired;
		let manifest;
		let savedPlatforms;
		if (opts.action === 'rollback') {
			let saved;
			try {
				saved = JSON.parse(readFileSync(join(config.stateDir, 'previous.json'), 'utf8'));
			} catch {
				throw new Error('복원할 이전 앱 배포가 없습니다.');
			}
			if (saved.appStack !== config.appStack || saved.repository !== config.repository || saved.branch !== config.branch)
				throw new Error('이전 배포의 stack·저장소·브랜치가 다릅니다.');
			desired = saved.stack;
			savedPlatforms = saved.platforms ?? {};
		} else {
			let common;
			try {
				common = parseEnv(readFileSync(config.envFile, 'utf8'));
			} catch {
				throw new Error('설정한 .env 파일을 읽을 수 없습니다.');
			}
			sensitive.push(...Object.values(common));
			const envs = environments(common, config, Object.fromEntries(APPS.map((app) => [app, before.services[app].environment])));
			manifest = manifestProvider(
				{
					repository: config.repository,
					branch: config.branch,
					runId: opts.runId
				},
				run
			);
			desired = structuredClone(before);
			for (const app of APPS) {
				desired.services[app].image = manifest.images[app];
				desired.services[app].environment = envs[app];
			}
			// Preserve stop-first and the existing grace period, extending it to 30 seconds if needed.
			desired.services.bot.deploy.update_config = {
				...desired.services.bot.deploy.update_config,
				order: 'stop-first'
			};
			desired.services.bot.stop_grace_period = ns(Math.max(current.bot.Spec.TaskTemplate.ContainerSpec.StopGracePeriod ?? 0, 30e9));
		}
		for (const image of new Set(Object.values(desired.services).map((service) => service.image))) {
			run('docker', ['manifest', 'inspect', image]);
		}
		let infra;
		let infraPlans = {};
		let infraChanged = false;
		if (opts.withInfra) {
			if (!config.infraStack) throw new Error('--with-infra에는 기존 infraStack 설정이 필요합니다.');
			const existing = inspectServices(config, ['redis', 'postgres'], config.infraStack, run);
			infra = makeStack(existing, run);
			const beforeInfra = structuredClone(infra);
			const originalHash = fingerprint(infra);
			protectInfra(existing, infra, run);
			infraChanged = fingerprint(infra) !== originalHash;
			infraPlans = preparePlatformUpdates(existing, beforeInfra, infra);
			for (const service of Object.values(infra.services)) {
				run('docker', ['manifest', 'inspect', service.image]);
				sensitive.push(...Object.values(service.environment));
			}
		}
		const platformPlans = preparePlatformUpdates(current, before, desired, savedPlatforms);
		// Check both stacks before dry-run success, snapshot writes, or any service update.
		validateStack(desired, config.appStack, run);
		if (infra) validateStack(infra, config.infraStack, run);
		const changed = APPS.filter((app) => fingerprint(before.services[app]) !== fingerprint(desired.services[app]));
		// Only a manual rollback whose saved target already matches the live spec may
		// acknowledge a completed automatic rollback without updating the service again.
		const rollbackTargets =
			opts.action === 'rollback'
				? Object.fromEntries(APPS.filter((app) => !changed.includes(app)).map((app) => [current[app].Spec.Name, fingerprint(current[app].Spec)]))
				: {};
		log(
			`${opts.action === 'rollback' ? '복원' : '배포'} 대상: ${config.appStack}${manifest ? ` / CI ${manifest.runId} / ${manifest.commit.slice(0, 7)}` : ''}`
		);
		for (const app of APPS) log(`${app}: ${changed.includes(app) ? '업데이트' : '변경 없음'} / replica ${desired.services[app].deploy.replicas}`);
		if (infra) log(`인프라: ${config.infraStack} / 기존 볼륨·저장 노드·이미지 유지`);
		if (opts.dryRun) {
			log('dry-run 완료. 서비스와 배포 상태 파일은 변경하지 않았습니다.');
			return;
		}
		let pending;
		try {
			pending = JSON.parse(readFileSync(join(config.stateDir, 'pending.json'), 'utf8'));
		} catch {}
		if (opts.action === 'deploy' && pending && fingerprint(pending.desired) !== fingerprint(desired)) {
			throw new Error('완료되지 않은 배포가 있습니다. 같은 --run으로 재시도하거나 rollback 후 새 배포를 실행하세요.');
		}
		if (changed.length && opts.action === 'deploy' && !pending) {
			protectedWrite(join(config.stateDir, 'previous.json'), {
				repository: config.repository,
				branch: config.branch,
				appStack: config.appStack,
				platforms: Object.fromEntries(APPS.map((app) => [app, current[app].Spec.TaskTemplate.Placement?.Platforms ?? []])),
				stack: before
			});
			protectedWrite(join(config.stateDir, 'pending.json'), {
				desired,
				runId: manifest.runId
			});
		}
		if (infra) {
			if (infraChanged) {
				updating = true;
				applyStack(infra, config.infraStack, infraPlans, run);
			}
			await waitForServices(
				['redis', 'postgres'].map((app) => `${config.infraStack}_${app}`),
				config,
				run
			);
		}
		if (changed.length) {
			updating = true;
			applyStack(desired, config.appStack, platformPlans, run);
		}
		await waitForServices(
			APPS.map((app) => `${config.appStack}_${app}`),
			config,
			run,
			Date.now,
			sleep,
			rollbackTargets
		);
		protectedWrite(join(config.stateDir, 'current.json'), {
			manifest,
			stack: desired,
			appliedAt: new Date().toISOString()
		});
		rmSync(join(config.stateDir, 'pending.json'), { force: true });
		log('앱 서비스 수렴과 task 안정성 확인 완료.');
	} catch (error) {
		if (updating) diagnostics(config, run, log, redact);
		throw error;
	} finally {
		try {
			for (const id of clusterLocks.reverse()) run('docker', ['config', 'rm', id]);
		} finally {
			releaseLock();
		}
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
