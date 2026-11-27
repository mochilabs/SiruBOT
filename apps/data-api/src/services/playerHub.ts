import {
	PLAYER_STATE_CHANNEL_PATTERN,
	guildIdFromPlayerStateChannel,
	playerStateSchema,
	type PlayerStatePayload,
	type PlayerStateResponse
} from '@sirubot/utils';
import { resolveRedisSigningKey, unwrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { getLogger } from '../utils/logger.ts';
import { HubSubscriber } from '../utils/hubSubscriber.ts';

const logger = getLogger('playerHub');

const STALE_MS = 60_000;
const PURGE_MS = 10 * 60_000;
const MAX_ENTRIES = 5_000;

interface Entry {
	state: PlayerStatePayload;
	lastUpdate: number;
}

const states = new Map<string, Entry>();

const sseSubscribers = new Map<string, Set<(payload: string) => void>>();

export function notifySseSubscribers(guildId: string, payload: string): void {
	const subs = sseSubscribers.get(guildId);
	if (!subs) return;
	for (const send of subs) {
		try {
			send(payload);
		} catch {}
	}
}

export function subscribeSse(guildId: string, send: (payload: string) => void): () => void {
	let set = sseSubscribers.get(guildId);
	if (!set) {
		set = new Set();
		sseSubscribers.set(guildId, set);
	}
	set.add(send);
	return () => {
		const current = sseSubscribers.get(guildId);
		if (!current) return;
		current.delete(send);
		if (current.size === 0) sseSubscribers.delete(guildId);
	};
}

export function handlePlayerStateMessage(message: string, channel: string): void {
	const guildId = guildIdFromPlayerStateChannel(channel);
	if (!guildId) return;

	// Read signing key per message so tests can swap env; reject unsigned frames when set.
	const body = unwrapRedisMessage(resolveRedisSigningKey(process.env), message);
	if (body === null) {
		logger.warn(`Rejected player state from ${channel} with invalid signature`);
		return;
	}

	try {
		const result = playerStateSchema.safeParse(JSON.parse(body));
		if (!result.success) {
			logger.debug(`Malformed player state from ${channel}: ${result.error.issues[0]?.message ?? 'invalid shape'}`);
			return;
		}
		const parsed: PlayerStatePayload = result.data;
		if (parsed.guildId !== guildId) return;

		if (parsed.ended === true) {
			states.delete(guildId);
			notifySseSubscribers(guildId, JSON.stringify({ player: getPlayerState(guildId), hub: playerHubStatus() }));
			return;
		}

		if (states.size >= MAX_ENTRIES && !states.has(guildId)) {
			const oldest = [...states.entries()].sort((a, b) => a[1].lastUpdate - b[1].lastUpdate)[0];
			if (oldest) states.delete(oldest[0]);
		}

		states.set(guildId, { state: parsed, lastUpdate: Date.now() });
		// Re-wrap with {player, hub} envelope so SSE frames include ageMs/stale.
		notifySseSubscribers(guildId, JSON.stringify({ player: getPlayerState(guildId), hub: playerHubStatus() }));
	} catch (error) {
		logger.debug(`Malformed player state from ${channel}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

const subscriber = new HubSubscriber({
	name: 'player hub',
	channel: PLAYER_STATE_CHANNEL_PATTERN,
	pattern: true,
	onMessage: handlePlayerStateMessage,
	logger
});

export async function startPlayerHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, player hub will have no live states (in-memory only)');
		return;
	}
	await subscriber.start(redisUrl);
}

export async function stopPlayerHub(): Promise<void> {
	await subscriber.stop();
}

export function getPlayerState(guildId: string): PlayerStateResponse | null {
	const entry = states.get(guildId);
	if (!entry) return null;
	const ageMs = Date.now() - entry.lastUpdate;
	if (ageMs > PURGE_MS) {
		states.delete(guildId);
		return null;
	}
	return { ...entry.state, ageMs, stale: ageMs > STALE_MS };
}

export function playerHubStatus(): { guilds: number; subscribed: boolean; staleMs: number } {
	return { guilds: states.size, subscribed: subscriber.isSubscribed, staleMs: STALE_MS };
}
