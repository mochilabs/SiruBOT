import { fetch } from 'undici';
import { getLogger } from './logger.ts';

const logger = getLogger('gateway');

export interface GatewayResponse {
	url: string;
	shards: number;
	session_start_limit: {
		total: number;
		remaining: number;
		reset_after: number;
		max_concurrency: number;
	};
}

export async function getGatewayInfo(): Promise<GatewayResponse | null> {
	try {
		const response = await fetch(`https://discord.com/api/v10/gateway/bot`, {
			headers: {
				Authorization: `Bot ${process.env.DISCORD_TOKEN}`
			}
		});

		if (!response.ok) {
			logger.error('shard.manager.gateway_error', { status: response.status, statusText: response.statusText });
			return null;
		}

		const data = (await response.json()) as GatewayResponse;
		return data;
	} catch (error) {
		logger.error('shard.manager.gateway_error', error);
		return null;
	}
}
