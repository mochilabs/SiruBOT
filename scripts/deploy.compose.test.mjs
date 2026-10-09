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
		TaskTemplate: { ContainerSpec: { Image: 'node:22-alpine', ...container } },
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
