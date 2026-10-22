import { container } from '@sapphire/framework';
import type { ChatAbortResult } from './types.ts';

// 응답 중지 레지스트리
const chatAborts = new Map<string, { controller: AbortController; userId: string }>();

/** 채널별 동시 턴 잠금 — /채팅과 멘션 답변이 같은 채널 히스토리를 경쟁하지 않도록 해요 */
const activeChannelTurns = new Set<string>();

/** 채널 턴 점유 시도 — 이미 진행 중이면 false */
export function acquireChannelTurn(channelId: string): boolean {
	if (activeChannelTurns.has(channelId)) return false;
	activeChannelTurns.add(channelId);
	return true;
}

export function releaseChannelTurn(channelId: string): void {
	activeChannelTurns.delete(channelId);
}

// 유저당 턴 상한 (10분 윈도우)
/** 윈도우(10분)당 유저별 최대 AI 턴 수 */
const USER_TURN_WINDOW_SECONDS = 10 * 60;
const USER_TURN_LIMIT = 20;
/** Redis 키: ai/turns/{userId}/{윈도우시작시각} — 윈도우마다 자동 정리돼요 */
const userTurnCounterTtl = USER_TURN_WINDOW_SECONDS;

/**
 * 유저 턴 소비 시도 — 10분 윈도우당 상한(USER_TURN_LIMIT) 초과 시 false.
 * Redis 카운터로 셰드 간 공유되며, Redis가 없으면 보호 없이 통과해요. (가용성 우선)
 */
export async function tryConsumeUserTurn(userId: string): Promise<boolean> {
	const store = container.redisStore;
	if (!store) return true;

	const window = Math.floor(Date.now() / (USER_TURN_WINDOW_SECONDS * 1000));
	const used = await store.incrementCacheCounter(`ai/turns/${userId}:${window}`, userTurnCounterTtl);
	return used <= USER_TURN_LIMIT;
}

/** 턴 시작 시 중지 컨트롤러를 등록해요. key는 중지 버튼 customId에 쓰여요. */
export function registerChatAbort(userId: string): { key: string; controller: AbortController } {
	const key = crypto.randomUUID().replace(/-/g, '');
	const controller = new AbortController();
	chatAborts.set(key, { controller, userId });
	return { key, controller };
}

export function releaseChatAbort(key: string): void {
	chatAborts.delete(key);
}

/** 중지 버튼 클릭 처리 — 요청자가 본인일 때만 중지해요. */
export function abortChatTurn(key: string, requesterId: string): ChatAbortResult {
	const entry = chatAborts.get(key);
	if (!entry) return 'not_found';
	if (entry.userId !== requesterId) return 'forbidden';
	entry.controller.abort();
	return 'ok';
}
