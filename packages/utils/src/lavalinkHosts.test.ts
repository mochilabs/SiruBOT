import { describe, expect, it } from 'vitest';
import { parseLavalinkHosts } from './lavalinkHosts.ts';

describe('parseLavalinkHosts', () => {
	it('parses a valid node list, keeping underscores in explicit passwords', () => {
		const { hosts, defaultPasswordUsed } = parseLavalinkHosts(' main_localhost_2333_secret_pass , backup_10.0.0.1_2334', 'globalpw');
		expect(hosts).toEqual([
			{ id: 'main', host: 'localhost', port: 2333, authorization: 'secret_pass' },
			{ id: 'backup', host: '10.0.0.1', port: 2334, authorization: 'globalpw' }
		]);
		expect(defaultPasswordUsed).toBe(false);
	});

	it('flags nodes without any password as fallback users', () => {
		const { hosts, defaultPasswordUsed } = parseLavalinkHosts('main_localhost_2333', '');
		expect(hosts[0]?.authorization).toBe('youshallnotpass');
		expect(defaultPasswordUsed).toBe(true);
	});

	it('rejects malformed entries with an indexed message', () => {
		expect(() => parseLavalinkHosts('main_localhost', '')).toThrow(/at index 0/);
		expect(() => parseLavalinkHosts('main_localhost_99999', '')).toThrow(/Invalid port/);
		expect(() => parseLavalinkHosts('   ', '')).toThrow(/at index 0/);
	});
});
