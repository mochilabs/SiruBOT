import type { RedisStore } from '../../../music/index.ts';
import type { ChatAbortResult } from './types.ts';

export type TurnCounterStore = Pick<RedisStore, 'incrementCacheCounter'> | undefined;

const USER_TURN_WINDOW_SECONDS = 10 * 60;
const USER_TURN_LIMIT = 20;
const userTurnCounterTtl = USER_TURN_WINDOW_SECONDS;

export type ChatTurnDenial = 'channel_busy' | 'rate_limited';

export type ChatTurnGrant = { ok: true; release: () => void } | { ok: false; denial: ChatTurnDenial };

export function createTurnControl(getRedisStore: () => TurnCounterStore) {
	const chatAborts = new Map<string, { controller: AbortController; userId: string }>();
	const activeChannelTurns = new Set<string>();

	function acquireChannelTurn(channelId: string): boolean {
		if (activeChannelTurns.has(channelId)) return false;
		activeChannelTurns.add(channelId);
		return true;
	}

	function releaseChannelTurn(channelId: string): void {
		activeChannelTurns.delete(channelId);
	}

	async function tryConsumeUserTurn(userId: string): Promise<boolean> {
		const store = getRedisStore();
		if (!store) return true;

		const window = Math.floor(Date.now() / (USER_TURN_WINDOW_SECONDS * 1000));
		const used = await store.incrementCacheCounter(`ai/turns/${userId}:${window}`, userTurnCounterTtl);
		return used <= USER_TURN_LIMIT;
	}

	async function acquireChatTurn(channelId: string, userId: string): Promise<ChatTurnGrant> {
		if (!acquireChannelTurn(channelId)) return { ok: false, denial: 'channel_busy' };
		if (!(await tryConsumeUserTurn(userId))) {
			releaseChannelTurn(channelId);
			return { ok: false, denial: 'rate_limited' };
		}
		return { ok: true, release: () => releaseChannelTurn(channelId) };
	}

	function registerChatAbort(userId: string): { key: string; controller: AbortController } {
		const key = crypto.randomUUID().replace(/-/g, '');
		const controller = new AbortController();
		chatAborts.set(key, { controller, userId });
		return { key, controller };
	}

	function releaseChatAbort(key: string): void {
		chatAborts.delete(key);
	}

	function abortChatTurn(key: string, requesterId: string): ChatAbortResult {
		const entry = chatAborts.get(key);
		if (!entry) return 'not_found';
		if (entry.userId !== requesterId) return 'forbidden';
		entry.controller.abort();
		return 'ok';
	}

	return { acquireChannelTurn, releaseChannelTurn, acquireChatTurn, tryConsumeUserTurn, registerChatAbort, releaseChatAbort, abortChatTurn };
}

export type TurnControl = ReturnType<typeof createTurnControl>;
