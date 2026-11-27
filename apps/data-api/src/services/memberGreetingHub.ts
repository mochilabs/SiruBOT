import {
	MEMBER_GREETING_STATE_CHANNEL_PREFIX,
	memberGreetingStateEvent,
	memberGreetingTestStateSchema,
	type GreetingTestResult
} from '@sirubot/utils';
import { resolveRedisSigningKey, unwrapRedisMessage } from '@sirubot/utils/redisEnvelope';

import { getLogger } from '../utils/logger.ts';
import { HubSubscriber } from '../utils/hubSubscriber.ts';

const logger = getLogger('memberGreetingHub');

const MAX_ENTRIES = 5_000;
const CHANNEL_PATTERN = memberGreetingStateEvent.pattern;

export { memberGreetingTestStateSchema, type GreetingTestResult };

interface Entry {
	result: GreetingTestResult;
	receivedAt: number;
}

function parsePayload(message: string): GreetingTestResult | null {
	try {
		const result = memberGreetingTestStateSchema.safeParse(JSON.parse(message));
		if (!result.success) {
			logger.debug(`Malformed member greeting state: ${result.error.issues[0]?.message ?? 'invalid shape'}`);
			return null;
		}
		return result.data;
	} catch (error) {
		logger.debug(`Malformed member greeting state: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

const results = new Map<string, Entry>();

export function handleMemberGreetingStateMessage(message: string, channel: string): void {
	if (!channel.startsWith(MEMBER_GREETING_STATE_CHANNEL_PREFIX)) return;
	const guildId = channel.slice(MEMBER_GREETING_STATE_CHANNEL_PREFIX.length);
	if (!guildId) return;

	// Read signing key per message so tests can swap env; reject unsigned frames when set.
	const body = unwrapRedisMessage(resolveRedisSigningKey(process.env), message);
	if (body === null) {
		logger.warn(`Rejected member greeting state from ${channel} with invalid signature`);
		return;
	}

	const payload = parsePayload(body);
	if (!payload) return;

	if (results.size >= MAX_ENTRIES && !results.has(guildId)) {
		const oldest = [...results.entries()].sort((a, b) => a[1].receivedAt - b[1].receivedAt)[0];
		if (oldest) results.delete(oldest[0]);
	}

	results.set(guildId, { result: payload, receivedAt: Date.now() });
}

const subscriber = new HubSubscriber({
	name: 'member greeting hub',
	channel: CHANNEL_PATTERN,
	pattern: true,
	onMessage: handleMemberGreetingStateMessage,
	logger
});

export async function startMemberGreetingHub(redisUrl: string | undefined): Promise<void> {
	if (!redisUrl) {
		logger.warn('REDIS_URL is not set, member greeting hub will not receive test results');
		return;
	}
	await subscriber.start(redisUrl);
}

export async function stopMemberGreetingHub(): Promise<void> {
	await subscriber.stop();
}

export function getGreetingTestResult(guildId: string): { found: false } | ({ found: true } & GreetingTestResult) {
	const entry = results.get(guildId);
	if (!entry) return { found: false };
	return { found: true, ...entry.result };
}
