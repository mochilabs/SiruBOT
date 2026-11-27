import {
	BOT_PROFILE_REFRESH_CHANNEL,
	BOT_PROFILE_STATE_CHANNEL_PREFIX,
	botProfileStateEvent,
	botProfileStateSchema,
	type BotProfileStatePayload
} from '@sirubot/utils';
import { resolveRedisSigningKey, unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';

import { sharedCache } from '../utils/cache.ts';
import { getLogger } from '../utils/logger.ts';
import { HubSubscriber } from '../utils/hubSubscriber.ts';

const logger = getLogger('botProfileHub');

const REFRESH_TIMEOUT_MS = 5_000;
const MAX_ENTRIES = 5_000;
const CHANNEL_PATTERN = botProfileStateEvent.pattern;

export { botProfileStateSchema, type BotProfileStatePayload };

interface Entry {
	state: BotProfileStatePayload;
	lastUpdate: number;
}

interface RefreshRequest {
	promise: Promise<boolean>;
	resolve: (refreshed: boolean) => void;
	timer: ReturnType<typeof setTimeout>;
}

const states = new Map<string, Entry>();
const refreshRequests = new Map<string, RefreshRequest>();

function parsePayload(message: string, guildId: string): BotProfileStatePayload | null {
	try {
		const result = botProfileStateSchema.safeParse(JSON.parse(message));
		if (!result.success) {
			logger.debug(
				`Malformed bot profile state from ${BOT_PROFILE_STATE_CHANNEL_PREFIX}${guildId}: ${result.error.issues[0]?.message ?? 'invalid shape'}`
			);
			return null;
		}
		if (result.data.guildId !== guildId) return null;
		return result.data;
	} catch (error) {
		logger.debug(
			`Malformed bot profile state from ${BOT_PROFILE_STATE_CHANNEL_PREFIX}${guildId}: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
		return null;
	}
}

export function handleBotProfileStateMessage(message: string, channel: string): void {
	if (!channel.startsWith(BOT_PROFILE_STATE_CHANNEL_PREFIX)) return;
	const guildId = channel.slice(BOT_PROFILE_STATE_CHANNEL_PREFIX.length);
	if (!guildId) return;

	// Read signing key per message so tests can swap env; reject unsigned frames when set.
	const body = unwrapRedisMessage(resolveRedisSigningKey(process.env), message);
	if (body === null) {
		logger.warn(`Rejected bot profile state from ${channel} with invalid signature`);
		return;
	}

	const payload = parsePayload(body, guildId);
	if (!payload) return;

	if (states.size >= MAX_ENTRIES && !states.has(guildId)) {
		const oldest = [...states.entries()].sort((a, b) => a[1].lastUpdate - b[1].lastUpdate)[0];
		if (oldest) states.delete(oldest[0]);
	}

	states.set(guildId, { state: payload, lastUpdate: Date.now() });
	const refresh = refreshRequests.get(guildId);
	if (refresh) {
		clearTimeout(refresh.timer);
		refreshRequests.delete(guildId);
		refresh.resolve(true);
	}
}

const subscriber = new HubSubscriber({
	name: 'bot profile hub',
	channel: CHANNEL_PATTERN,
	pattern: true,
	onMessage: handleBotProfileStateMessage,
	logger
});

export async function startBotProfileHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, bot profile hub will have no live states (in-memory only)');
		return;
	}
	await subscriber.start(redisUrl);
}

export async function stopBotProfileHub(): Promise<void> {
	await subscriber.stop();
}

export type BotProfileStateResponse = BotProfileStatePayload;

export function getBotProfile(guildId: string): BotProfileStateResponse | null {
	const entry = states.get(guildId);
	if (!entry) return null;
	return entry.state;
}

export async function refreshBotProfile(guildId: string): Promise<boolean> {
	const client = sharedCache.getClient();
	if (!client) return false;
	const existing = refreshRequests.get(guildId);
	if (existing) return existing.promise;

	let resolve!: (refreshed: boolean) => void;
	const response = new Promise<boolean>((res) => {
		resolve = res;
	});
	const timer = setTimeout(() => {
		refreshRequests.delete(guildId);
		resolve(false);
	}, REFRESH_TIMEOUT_MS);
	refreshRequests.set(guildId, { promise: response, resolve, timer });
	try {
		await client.publish(BOT_PROFILE_REFRESH_CHANNEL, wrapRedisMessage(resolveRedisSigningKey(process.env), { guildId }));
	} catch (error) {
		clearTimeout(timer);
		refreshRequests.delete(guildId);
		logger.warn(`Bot profile refresh request publish failed (${guildId}): ${error instanceof Error ? error.message : String(error)}`);
		resolve(false);
	}
	return response;
}

export function botProfileHubStatus(): { guilds: number; subscribed: boolean } {
	return { guilds: states.size, subscribed: subscriber.isSubscribed };
}
