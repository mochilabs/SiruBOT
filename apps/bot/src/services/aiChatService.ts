/**
 * AI 채팅 서비스 퍼사드 — 구현은 ./aiChat/ 하위 모듈로 분리돼 있어요.
 * 공개 계약(모듈 경로·export 목록)을 유지하기 위해 소비자는 계속 이 파일에서 임포트합니다.
 *
 * | 모듈 | 책임 |
 * |---|---|
 * | aiChat/types.ts | 공용 타입·ChatServiceError·contentText |
 * | aiChat/tokenBudget.ts | 토큰 추정·컨텍스트 예산 |
 * | aiChat/config.ts | .env 채팅 설정·길드 AI 정책 |
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
export { estimateTokens, getContextTokenBudget } from './aiChat/tokenBudget.ts';
export { getChatConfig, getAiChatPolicy, assertChatEnabled, type AiChatPolicy } from './aiChat/config.ts';
export {
	loadChannelHistory,
	clearChannelHistory,
	dropChannelHistory,
	removeFromChannelHistory,
	updateChannelHistoryMessage,
	isAiAssistantMessage,
	flushChannelHistoryPersist
} from './aiChat/historyStore.ts';
export {
	acquireChannelTurn,
	acquireChatTurn,
	releaseChannelTurn,
	tryConsumeUserTurn,
	registerChatAbort,
	releaseChatAbort,
	abortChatTurn,
	type ChatTurnDenial,
	type ChatTurnGrant
} from './aiChat/turnControl.ts';
export { extractThinkTokens, streamChatCompletion } from './aiChat/completion.ts';
export { collectImageUrls, runChatTurn } from './aiChat/agentLoop.ts';
