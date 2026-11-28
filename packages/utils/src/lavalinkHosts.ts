import { z } from 'zod';

const nodeConfigSchema = z.object({
	id: z.string().min(1),
	host: z.string().min(1),
	port: z.number().int().min(1).max(65535),
	authorization: z.string().min(1)
});

export type LavalinkNodeConfig = z.infer<typeof nodeConfigSchema>;

export interface ParsedLavalinkHosts {
	hosts: LavalinkNodeConfig[];
	defaultPasswordUsed: boolean;
}

export function parseLavalinkHosts(raw: string, globalPassword: string): ParsedLavalinkHosts {
	const hosts: LavalinkNodeConfig[] = [];
	let defaultPasswordUsed = false;

	for (const [index, entry] of raw.split(',').entries()) {
		const parts = entry.trim().split('_');
		// Never include raw entry or port token in errors to avoid leaking passwords.
		if (parts.length < 3) {
			throw new Error(`Invalid LAVALINK_HOSTS format at index ${index}. ` + `Expected: "id_host_port[_password]"`);
		}
		const [id, host, portStr, ...passwordParts] = parts;
		if (!id || !host) {
			throw new Error(`Invalid LAVALINK_HOSTS format at index ${index}. id/host must not be empty.`);
		}
		const port = parseInt(portStr, 10);
		if (isNaN(port) || port <= 0 || port > 65535) {
			throw new Error(`Invalid port for node "${id}" at index ${index}`);
		}
		const explicitPassword = passwordParts.length > 0 ? passwordParts.join('_') : globalPassword;
		const password = explicitPassword || 'youshallnotpass';
		if (!explicitPassword) defaultPasswordUsed = true;
		hosts.push(nodeConfigSchema.parse({ id, host, port, authorization: password }));
	}

	return { hosts, defaultPasswordUsed };
}
