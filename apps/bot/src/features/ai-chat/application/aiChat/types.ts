/**
 * AI 채팅 도메인의 공용 타입과 오류 타입을 모아요.
 * 하위 모듈들이 서로를 임포트하지 않고 이 파일만 바라보게 해서 순환 의존을 막아요.
 */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** OpenAI compatible content part — 멀티모달(이미지) 입력용 */
export type ChatContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export type ChatContent = string | ChatContentPart[];

/** content에서 텍스트만 뽑아요 (히스토리·시스템 프롬프트 조립용) */
export function contentText(content: ChatContent): string {
	if (typeof content === 'string') return content;
	return content
		.filter((part): part is Extract<ChatContentPart, { type: 'text' }> => part.type === 'text')
		.map((part) => part.text)
		.join('');
}

export interface ToolCallRequest {
	id: string;
	name: string;
	arguments: string;
}

export interface ChatMessage {
	role: ChatRole;
	content: ChatContent;
	/** role이 user일 때 화자 표시명 (채널 대화에서 사용자를 구별해요) */
	author?: string;
	/** role이 user일 때 발화자 사용자 ID */
	userId?: string;
	/** 메시지 생성 시각 (ms) */
	at?: number;
	/** 원문 Discord 메시지 ID — 삭제/편집되면 기록도 함께 동기화돼요 */
	messageId?: string;
	/** 첨부한 이미지 수 — 히스토리 라인에 "[이미지 N장]"으로 표시돼요 */
	imageCount?: number;
	tool_calls?: ToolCallRequest[];
	tool_call_id?: string;
}

export interface ChatConfig {
	apiUrl: string;
	apiKey: string;
	model: string;
	timeoutMs: number;
	streamUpdateMs: number;
	thinkToken: boolean;
}

// 채널별 대화 기록 (인메모리 캐시 + PostgreSQL 영속화)
export interface ChannelHistoryState {
	/** 최근 대화 (오래된 → 최신) */
	messages: ChatMessage[];
	/** 오래된 대화를 압축해 만든 롤링 요약 */
	summary: string | null;
	/** 요약 대기 중인 원문 — 백그라운드 요약 작업이 summary로 흡수해요 */
	pending: ChatMessage[];
	/** messages 전부의 historyLine 토큰 합계 — push/제거마다 증분 갱신해요 (persist payload에는 담지 않아요, 로드 시 재계산) */
	tokens: number;
}

// 오류
export class ChatServiceError extends Error {
	public constructor(
		public readonly identifier: string,
		message: string
	) {
		super(message);
		this.name = 'ChatServiceError';
	}
}

export type ChatAbortResult = 'ok' | 'not_found' | 'forbidden';

export interface StreamCompletionResult {
	content: string;
	toolCalls: ToolCallRequest[];
}

/** 한 턴이 끝난 결과 — memoryUpdated면 최종 화면에 "(메모리 업데이트됨)"을 붙여요 */
export interface ChatTurnResult {
	answer: string;
	memoryUpdated: boolean;
}
