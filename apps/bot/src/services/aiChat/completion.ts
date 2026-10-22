import { container } from '@sapphire/framework';
import type { AiToolDefinition } from '../aiTools/index.ts';
import { ChatServiceError, contentText, type ChatConfig, type ChatMessage, type StreamCompletionResult, type ToolCallRequest } from './types.ts';

const REASON_OPEN = '<think>';
const REASON_CLOSE = '</think>';

/** `<think>` 토큰을 쓰는 모델용 — 추론 부분을 본문에서 제거 */
export function extractThinkTokens(raw: string): string {
	let result = '';
	let insideReason = false;
	let index = 0;
	while (index < raw.length) {
		if (!insideReason) {
			const open = raw.toLowerCase().indexOf(REASON_OPEN, index);
			if (open === -1) {
				result += raw.slice(index);
				break;
			}
			result += raw.slice(index, open);
			index = open + REASON_OPEN.length;
			insideReason = true;
			continue;
		}
		const close = raw.toLowerCase().indexOf(REASON_CLOSE, index);
		if (close === -1) break;
		index = close + REASON_CLOSE.length;
		insideReason = false;
	}
	return result;
}

function finalizeText(text: string, config: ChatConfig): string {
	const trimmed = config.thinkToken ? extractThinkTokens(text) : text;
	return trimmed.replace(/[ \t]{2,}/g, ' ').trim();
}

function toApiMessage(message: ChatMessage) {
	if (message.role === 'assistant' && message.tool_calls?.length) {
		return {
			role: 'assistant' as const,
			content: contentText(message.content) || null,
			tool_calls: message.tool_calls.map((tc) => ({
				type: 'function' as const,
				id: tc.id,
				function: { name: tc.name, arguments: tc.arguments }
			}))
		};
	}
	if (message.role === 'tool') {
		return { role: 'tool' as const, tool_call_id: message.tool_call_id ?? '', content: contentText(message.content) };
	}
	return { role: message.role, content: message.content };
}

/**
 * OpenAI compatible `/chat/completions` 를 스트리밍으로 호출해요.
 * onDelta에는 지금까지 누적된 본문이 전달돼요. tool_calls가 있으면 함께 돌려줘요.
 */
export async function streamChatCompletion(options: {
	messages: ChatMessage[];
	config: ChatConfig;
	tools?: AiToolDefinition[];
	signal?: AbortSignal;
	onDelta?: (fullText: string) => void | Promise<void>;
}): Promise<StreamCompletionResult> {
	const { config } = options;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), config.timeoutMs);
	const onAbort = () => controller.abort();
	if (options.signal?.aborted) controller.abort();
	else options.signal?.addEventListener('abort', onAbort, { once: true });
	/** 사용자 중지가 아닌 타임아웃/외부 원인 구분용 */
	const userCancelled = () => options.signal?.aborted === true;
	const abortError = () =>
		userCancelled()
			? new ChatServiceError('chat_cancelled', '응답 생성을 중지했어요.')
			: new ChatServiceError('chat_timeout', 'AI 응답 대기 시간이 지났어요. 잠시 후 다시 시도해 주세요.');

	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

	const body: Record<string, unknown> = {
		model: config.model,
		messages: options.messages.map(toApiMessage),
		stream: true
	};
	if (options.tools?.length) {
		body.tools = options.tools;
		body.tool_choice = 'auto';
	}

	try {
		let res: Response;
		try {
			res = await fetch(`${config.apiUrl}/chat/completions`, {
				method: 'POST',
				headers,
				signal: controller.signal,
				body: JSON.stringify(body)
			});
		} catch (e) {
			if (controller.signal.aborted) throw abortError();
			throw new ChatServiceError('chat_unreachable', `AI 서버에 연결할 수 없어요. (${e instanceof Error ? e.message : String(e)})`);
		}

		if (!res.ok || !res.body) {
			throw new ChatServiceError('chat_http_error', `AI 요청에 실패했어요. (HTTP ${res.status})`);
		}

		const contentType = res.headers.get('content-type') ?? '';

		if (!contentType.includes('text/event-stream')) {
			let payload: any;
			try {
				payload = await res.json();
			} catch (e) {
				// 읽는 도중 타임아웃/중지가 걸리면 사유를 구분해요
				if (controller.signal.aborted) throw abortError();
				throw new ChatServiceError('chat_http_error', `AI 응답을 읽지 못했어요. (${e instanceof Error ? e.message : String(e)})`);
			}
			const message = payload?.choices?.[0]?.message;
			const fullText = String(message?.content ?? '');
			const toolCalls = collectToolCallsFromMessage(message);
			// 라이브 화면에도 정제본을 흘려 보낸다 — 중지·오류 경로에서는 최종 교체본(final)이
			// 한 번도 노출되지 않아 미정제 추론 토큰이 그대로 보이기 때문이다.
			await options.onDelta?.(finalizeText(fullText, config));
			return { content: finalizeText(fullText, config), toolCalls };
		}

		let fullText = '';
		let sawDone = false;
		const toolCalls: ToolCallRequest[] = [];
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';
				for (const rawLine of lines) {
					const line = rawLine.trim();
					if (!line.startsWith('data:')) continue;
					const data = line.slice(5).trim();
					if (!data) continue;
					if (data === '[DONE]') {
						sawDone = true;
						break;
					}

					let payload: any;
					try {
						payload = JSON.parse(data);
					} catch {
						continue;
					}
					const delta = payload?.choices?.[0]?.delta;
					if (delta?.content) {
						fullText += String(delta.content);
						// 스트리밍 중 화면에 보이는 본문도 정제본 — THINK 모드의 미정제 추론이
						// 라이브 화면에 노출되지 않도록 한다 (최종 교체본은 아래에서 한 번 더 정제).
						await options.onDelta?.(finalizeText(fullText, config));
					}
					if (Array.isArray(delta?.tool_calls)) {
						for (const chunk of delta.tool_calls) {
							const index = typeof chunk.index === 'number' ? chunk.index : 0;
							if (!toolCalls[index]) toolCalls[index] = { id: '', name: '', arguments: '' };
							if (chunk.id) toolCalls[index].id = chunk.id;
							if (chunk.function?.name) toolCalls[index].name += String(chunk.function.name);
							if (chunk.function?.arguments) toolCalls[index].arguments += String(chunk.function.arguments);
						}
					}
				}
				if (sawDone) break;
			}
		} catch (e) {
			if (e instanceof ChatServiceError) throw e;
			if (controller.signal.aborted) throw abortError();
			if (fullText) {
				container.logger.warn('chat.stream_interrupted', { error: String(e) });
				return { content: finalizeText(fullText, config), toolCalls: [] };
			}
			throw new ChatServiceError('chat_stream_failed', 'AI 응답을 받는 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.');
		}

		const cleanedCalls = toolCalls.filter((tc) => tc.name);
		if (!fullText && cleanedCalls.length === 0)
			throw new ChatServiceError('chat_empty_response', 'AI가 빈 답장을 보냈어요. 잠시 후 다시 시도해 주세요.');
		return { content: finalizeText(fullText, config), toolCalls: cleanedCalls };
	} finally {
		clearTimeout(timer);
		options.signal?.removeEventListener('abort', onAbort);
	}
}

function collectToolCallsFromMessage(message: any): ToolCallRequest[] {
	if (!Array.isArray(message?.tool_calls)) return [];
	return message.tool_calls.map(
		(tc: any): ToolCallRequest => ({
			id: String(tc?.id ?? ''),
			name: String(tc?.function?.name ?? ''),
			arguments: String(tc?.function?.arguments ?? '')
		})
	);
}
