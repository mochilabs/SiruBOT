import { container } from '@sapphire/framework';
import { executeAiTool, getAiToolDefinitions, getAiToolStatus, type AiToolContext } from '../aiTools/index.ts';
import { assertChatEnabled, getAiChatPolicy } from './config.ts';
import { streamChatCompletion } from './completion.ts';
import { getChannelHistoryState, loadChannelHistory, pushChannelHistory, setChannelGuild } from './historyStore.ts';
import { buildRecentChannelBlock, buildSystemContent } from './prompt.ts';
import { scheduleSummary } from './summarizer.ts';
import { ChatServiceError, type ChatConfig, type ChatContent, type ChatContentPart, type ChatMessage, type ChatTurnResult } from './types.ts';

const MAX_TOOL_ROUNDS = 5;

// 멀티모달 이미지
const MAX_IMAGES_PER_MESSAGE = 3;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Discord 첨부파일 중 모델에 보낼 수 있는 이미지 URL만 골라요.
 * image/* 이면서( svg 제외) 10MB 이하, 최대 MAX_IMAGES_PER_MESSAGE장.
 */
export function collectImageUrls(attachments: ReadonlyArray<{ url: string; contentType: string | null; size?: number | null }>): string[] {
	return attachments
		.filter((a) => {
			const type = (a.contentType ?? '').toLowerCase();
			if (!type.startsWith('image/') || type === 'image/svg+xml') return false;
			if (typeof a.size === 'number' && a.size > MAX_IMAGE_BYTES) return false;
			return Boolean(a.url);
		})
		.slice(0, MAX_IMAGES_PER_MESSAGE)
		.map((a) => a.url);
}

/** 사용자 메시지 content를 문자열 또는 멀티모달 파트 배열로 만들어요. (텍스트가 비면 이미지만 보내요) */
function buildUserContent(prompt: string, images?: string[]): ChatContent {
	if (!images?.length) return prompt;
	const parts: ChatContentPart[] = [];
	const text = prompt.trim();
	if (text) parts.push({ type: 'text', text });
	for (const url of images) parts.push({ type: 'image_url', image_url: { url } });
	return parts;
}

/**
 * 한 턴의 AI 대화를 agent 루프로 수행해요.
 * 1) 시스템 프롬프트(페르소나 + 사용자 기억 + 최근 대화 기록)와 질문으로 요청
 * 2) tool_calls가 오면 도구를 실행하고 결과를 되돌려 반복 (최대 MAX_TOOL_ROUNDS)
 * 3) 최종 답변을 채널 히스토리(DB)에 저장하고 단기 기억을 갱신해요
 *
 * 히스토리에는 사용자/어시스턴트 텍스트만 저장하고 도구 흔적은 남기지 않아요.
 */
export async function runChatTurn(options: {
	channelId: string;
	prompt: string;
	config: ChatConfig;
	toolContext: AiToolContext;
	/** 사용자 메시지에 함께 보낼 이미지 URL (미지정 시 텍스트만 전송) */
	images?: string[];
	/** 대화 기록에 남길 화자 표시명 (미지정 시 '사용자') */
	author?: string;
	/** 원문 Discord 메시지 ID — 삭제/편집 시 기록도 동기화돼요 */
	userMessageId?: string;
	/** 봇 답변 메시지 ID (중간에 보이는 라이브 메시지) — 삭제 시 기록에서 빠져요 */
	assistantMessageId?: string;
	/** 방금 입력한 메시지 등 채널 최근 채팅 블록에서 제외할 메시지 ID */
	excludeMessageId?: string;
	/** 중지 버튼용 사용자 취소 신호 — abort되면 chat_cancelled 오류로 멈춰요 */
	signal?: AbortSignal;
	onDelta?: (fullText: string) => void | Promise<void>;
	onStatus?: (status: string) => void | Promise<void>;
}): Promise<ChatTurnResult> {
	const { channelId, config } = options;
	const userId = options.toolContext.userId;
	const throwIfCancelled = () => {
		if (options.signal?.aborted) throw new ChatServiceError('chat_cancelled', '응답 생성을 중지했어요.');
	};

	const policy = await getAiChatPolicy(options.toolContext.guildId);
	assertChatEnabled(policy, channelId);

	setChannelGuild(channelId, options.toolContext.guildId);
	// 정책 확인 후, 서로 독립적인 맥락 조회를 함께 시작한다.
	const [, channelBlock, memoryBlock] = await Promise.all([
		loadChannelHistory(channelId),
		buildRecentChannelBlock(channelId, options.excludeMessageId),
		container.aiMemoryService.buildPromptBlock(userId).catch((error) => {
			container.logger.error('[aiChat] failed to load user memory:', error);
			return null;
		})
	]);

	const messages: ChatMessage[] = [
		{ role: 'system', content: buildSystemContent(getChannelHistoryState(channelId), channelBlock, memoryBlock) },
		{ role: 'user', content: buildUserContent(options.prompt, options.images) }
	];

	let answer = '';
	let memoryUpdated = false;
	for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
		throwIfCancelled();
		const result = await streamChatCompletion({
			messages,
			config,
			tools: round < MAX_TOOL_ROUNDS ? getAiToolDefinitions() : undefined,
			signal: options.signal,
			onDelta: options.onDelta
		});

		if (result.toolCalls.length === 0) {
			answer = result.content;
			break;
		}

		messages.push({ role: 'assistant', content: result.content, tool_calls: result.toolCalls });
		for (const toolCall of result.toolCalls) {
			throwIfCancelled();
			await options.onStatus?.(getAiToolStatus(toolCall.name, toolCall.arguments));
			const output = await executeAiTool(toolCall.name, toolCall.arguments, options.toolContext);
			if (toolCall.name.startsWith('memory_') && !memoryUpdated) {
				try {
					memoryUpdated = (JSON.parse(output) as { status?: string }).status === 'ok';
				} catch {
					memoryUpdated = false;
				}
			}
			messages.push({ role: 'tool', tool_call_id: toolCall.id, content: output });
		}
	}

	if (!answer) {
		throw new ChatServiceError('chat_empty_response', 'AI가 빈 답장을 보냈어요. 잠시 후 다시 시도해 주세요.');
	}
	// 턴 저장 직전 중지 클릭도 반영해요 — 저장 후 취소가 무시되는 창을 닫아요
	throwIfCancelled();

	const imageCount = options.images?.length ?? 0;
	const hasPrompt = Boolean(options.prompt.trim());
	const at = Date.now();
	// 이미지만 있는 턴도 기록에 남겨요 (라인에 "[이미지 N장]"으로 표시돼요)
	const userTurn: ChatMessage[] =
		hasPrompt || imageCount > 0
			? [
					{
						role: 'user',
						content: options.prompt,
						author: options.author ?? '사용자',
						userId,
						at,
						...(options.userMessageId ? { messageId: options.userMessageId } : {}),
						...(imageCount > 0 ? { imageCount } : {})
					}
				]
			: [];
	pushChannelHistory(channelId, ...userTurn, { role: 'assistant', content: answer, at, messageId: options.assistantMessageId });

	// 넘친 오래된 대화가 있으면 백그라운드에서 요약으로 압축해요
	scheduleSummary(channelId, config);

	if (hasPrompt) {
		await container.aiMemoryService.pushTurn(userId, channelId, options.prompt, answer).catch((error) => {
			container.logger.error('[aiChat] failed to push short-term memory:', error);
		});
	}

	return { answer, memoryUpdated };
}
