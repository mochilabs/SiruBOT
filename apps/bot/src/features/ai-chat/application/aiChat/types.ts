export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type ChatContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export type ChatContent = string | ChatContentPart[];

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
	author?: string;
	userId?: string;
	at?: number;
	messageId?: string;
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

export interface ChannelHistoryState {
	messages: ChatMessage[];
	summary: string | null;
	pending: ChatMessage[];
	/** messages 전부의 historyLine 토큰 합계 (persist payload에는 담지 않고 로드 시 재계산해요) */
	tokens: number;
}

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

export interface ChatTurnResult {
	answer: string;
	memoryUpdated: boolean;
}
