import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { composeService, escapeInterpolation } from './deploy.mjs';

let dockerAvailable = false;
try {
	execFileSync('docker', ['--version'], { stdio: 'ignore' });
	dockerAvailable = true;
} catch {}

const references = {};
function service(container = {}) {
	return {
		Name: 'test_app',
		Labels: {},
		TaskTemplate: { ContainerSpec: { Image: 'node:24-alpine', ...container } },
		Mode: { Replicated: { Replicas: 1 } }
	};
}
function dockerConfig(compose) {
	return execFileSync('docker', ['stack', 'config', '--compose-file', '-'], {
		input: JSON.stringify(escapeInterpolation({ version: '3.8', services: { app: compose } })),
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
		timeout: 10_000
	});
}

test('Swarm Hosts convert to Compose entries including IPv6 and aliases', () => {
	const compose = composeService(service({ Hosts: ['192.0.2.1 upstream.test alias.test', '2001:db8::1 ipv6.test'] }), references);
	assert.deepEqual(compose.extra_hosts, ['upstream.test:192.0.2.1', 'alias.test:192.0.2.1', 'ipv6.test:2001:db8::1'].sort());
	assert.deepEqual(
		composeService(service({ Hosts: ['2001:db8::1 ipv6.test', '192.0.2.1 alias.test upstream.test'] }), references).extra_hosts,
		compose.extra_hosts
	);
	assert.throws(() => composeService(service({ Hosts: ['192.0.2.1'] }), references), /Hosts/);
	assert.throws(() => composeService(service({ Hosts: ['192.0.2.1 upstream.test', '192.0.2.2 upstream.test'] }), references), /여러 IP/);
});
test('Docker legacy Compose parsing retains each converted host mapping', { skip: !dockerAvailable }, () => {
	const compose = composeService(service({ Hosts: ['192.0.2.1 upstream.test alias.test', '2001:db8::1 ipv6.test'] }), references);
	const rendered = dockerConfig(compose);
	assert.match(rendered, /upstream\.test:\s*192\.0\.2\.1/);
	assert.match(rendered, /alias\.test:\s*192\.0\.2\.1/);
	assert.match(rendered, /ipv6\.test:\s*["']?2001:db8::1/);
});
test('nonempty supplementary groups and DNS options are rejected while supported DNS settings remain', () => {
	assert.throws(() => composeService(service({ Groups: ['1001'] }), references), /Groups/);
	assert.throws(() => composeService(service({ DNSConfig: { Options: ['ndots:2'] } }), references), /Options/);
	const compose = composeService(
		service({ Groups: [], DNSConfig: { Nameservers: ['192.0.2.53'], Search: ['example.test'], Options: [] } }),
		references
	);
	assert.equal(Object.hasOwn(compose, 'group_add'), false);
	assert.equal(Object.hasOwn(compose, 'dns_opt'), false);
	assert.deepEqual(compose.dns, ['192.0.2.53']);
	assert.deepEqual(compose.dns_search, ['example.test']);
});
test('Docker legacy schema rejects the properties previously generated for Groups and DNS options', { skip: !dockerAvailable }, () => {
	const compose = composeService(service(), references);
	for (const field of [{ group_add: ['1001'] }, { dns_opt: ['ndots:2'] }]) {
		assert.throws(() => dockerConfig({ ...compose, ...field }), /additional property/i);
	}
	assert.doesNotThrow(() =>
		dockerConfig(
			composeService(service({ Groups: [], DNSConfig: { Nameservers: ['192.0.2.53'], Search: ['example.test'], Options: [] } }), references)
		)
	);
});
test('tmpfs mount options cannot be silently discarded while size and mode remain supported', () => {
	for (const options of [[['noexec']], [['nosuid']], [['size', '65536k']], [['noexec'], ['nosuid']]]) {
		const spec = service({ Mounts: [{ Type: 'tmpfs', Target: '/scratch', TmpfsOptions: { SizeBytes: 65536, Mode: 0o700, Options: options } }] });
		assert.throws(() => composeService(spec, references), /TmpfsOptions.*Options/);
	}
	const compose = composeService(
		service({ Mounts: [{ Type: 'tmpfs', Target: '/scratch', TmpfsOptions: { SizeBytes: 65536, Mode: 0o700, Options: [] } }] }),
		references
	);
	assert.deepEqual(compose.volumes[0].tmpfs, { size: 65536, mode: 0o700 });
});
test('Compose conversion alone rejects platform filters unless retained through a separate service update', () => {
	const spec = service();
	spec.TaskTemplate.Placement = { Platforms: [{ Architecture: 'arm64', OS: 'linux' }] };
	assert.throws(() => composeService(spec, references), /Platforms/);
	assert.doesNotThrow(() => composeService(spec, references, { retainPlatforms: true }));
});
