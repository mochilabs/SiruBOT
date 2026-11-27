export {
	contentText,
	ChatServiceError,
	type ChatRole,
	type ChatContentPart,
	type ChatContent,
	type ToolCallRequest,
	type ChatMessage,
	type ChatConfig,
	type ChannelHistoryState,
	type ChatAbortResult,
	type StreamCompletionResult,
	type ChatTurnResult
} from './aiChat/types.ts';
export { estimateTokens } from './aiChat/tokenBudget.ts';
export { assertChatEnabled, type AiChatPolicy } from './aiChat/config.ts';
export { type ChatTurnDenial, type ChatTurnGrant, type TurnCounterStore } from './aiChat/turnControl.ts';
export { extractThinkTokens } from './aiChat/completion.ts';
export { collectImageUrls, type ChatImage } from './aiChat/agentLoop.ts';
export type { AiChatDeps, AiChatPlayerView, AiToolRegistry } from './aiChat/deps.ts';

import { getAiChatPolicy } from './aiChat/config.ts';
import { createTurnControl } from './aiChat/turnControl.ts';
import { streamChatCompletion } from './aiChat/completion.ts';
import { runChatTurn } from './aiChat/agentLoop.ts';
import type { AiChatDeps } from './aiChat/deps.ts';

/**
 * 의존성이 필요한 AI 채팅 진입점을 deps에 묶어 한 번 만들어요 (container.aiChat).
 * 채널 기록(로드·삭제·편집 동기화)은 container.aiChatHistory가 맡고, 채널 턴 잠금·유저 턴 한도·중지 레지스트리는 이 인스턴스가 들고 있어요.
 */
export function createAiChat(deps: AiChatDeps) {
	const turns = createTurnControl(() => deps.getRedisStore());
	return {
		...turns,
		getAiChatPolicy: (guildId: string | null) => getAiChatPolicy(deps, guildId),
		runChatTurn: (options: Parameters<typeof runChatTurn>[1]) => runChatTurn(deps, options),
		streamChatCompletion: (options: Parameters<typeof streamChatCompletion>[1]) => streamChatCompletion(deps.logger, options)
	};
}

export type AiChat = ReturnType<typeof createAiChat>;
