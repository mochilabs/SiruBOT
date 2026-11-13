/**
 * AI 채팅 서비스 퍼사드 — 구현은 ./aiChat/ 하위 모듈로 분리돼 있어요.
 * 피처 밖에서는 features/ai-chat/index.ts를 통해서만 들어와요.
 *
 * | 모듈 | 책임 |
 * |---|---|
 * | aiChat/types.ts | 공용 타입·ChatServiceError·contentText |
 * | aiChat/tokenBudget.ts | 토큰 추정 (컨텍스트 예산 값은 deps로 받아요) |
 * | aiChat/config.ts | 길드 AI 정책 |
 * | aiChat/historyStore.ts | 채널 히스토리 인메모리 캐시 + DB 영속화·동기화 |
 * | aiChat/prompt.ts | 시스템 프롬프트·채널 최근 채팅 블록 조립 |
 * | aiChat/completion.ts | OpenAI compatible 스트리밍 호출·think 토큰 처리 |
 * | aiChat/summarizer.ts | 롤링 요약 백그라운드 작업 |
 * | aiChat/turnControl.ts | 채널 턴 잠금·유저 턴 한도·중지 레지스트리 |
 * | aiChat/agentLoop.ts | runChatTurn 에이전트 루프·멀티모달 첨부 처리 |
 */
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
export {
	acquireChannelTurn,
	releaseChannelTurn,
	registerChatAbort,
	releaseChatAbort,
	abortChatTurn,
	type ChatTurnDenial,
	type ChatTurnGrant,
	type TurnCounterStore
} from './aiChat/turnControl.ts';
export { extractThinkTokens } from './aiChat/completion.ts';
export { collectImageUrls } from './aiChat/agentLoop.ts';
export type { AiChatDeps, AiChatPlayerView, AiToolRegistry } from './aiChat/deps.ts';
export { appendCitedSources, extractWebSearchSources, normalizeCommaCitations } from './aiChat/traceCitation.ts';

import { getAiChatPolicy } from './aiChat/config.ts';
import { acquireChatTurn, tryConsumeUserTurn } from './aiChat/turnControl.ts';
import { streamChatCompletion } from './aiChat/completion.ts';
import { runChatTurn } from './aiChat/agentLoop.ts';
import type { AiChatDeps } from './aiChat/deps.ts';

/**
 * 의존성이 필요한 AI 채팅 진입점을 deps에 묶어 한 번 만들어요 (container.aiChat).
 * 채널 기록(로드·삭제·편집 동기화)은 container.aiChatHistory가 맡고, 의존성이 필요 없는 잠금·중지 함수는 위에서 그대로 내보내요.
 */
export function createAiChat(deps: AiChatDeps) {
	return {
		getAiChatPolicy: (guildId: string | null) => getAiChatPolicy(deps, guildId),
		runChatTurn: (options: Parameters<typeof runChatTurn>[1]) => runChatTurn(deps, options),
		streamChatCompletion: (options: Parameters<typeof streamChatCompletion>[1]) => streamChatCompletion(deps.logger, options),
		/** 채널 턴 확보 → 유저 턴 소모 (Redis는 연결 전이면 undefined라 호출 시점에 읽어요) */
		acquireChatTurn: (channelId: string, userId: string) => acquireChatTurn(deps.getRedisStore(), channelId, userId),
		tryConsumeUserTurn: (userId: string) => tryConsumeUserTurn(deps.getRedisStore(), userId)
	};
}

export type AiChat = ReturnType<typeof createAiChat>;
