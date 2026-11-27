import { ChatServiceError, type AiChat, type ChatConfig, type ChatImage } from '../application/aiChatService.ts';
import type { AiToolContext } from '../application/aiTools/index.ts';
import { toolConfirmText } from './views/toolConfirm.ts';
import { errorPayload, finalPayload, livePayload, statusPayload, stoppedPayload } from './views/chatView.ts';

const GENERIC_ERROR_TEXT = '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';

export interface ChatTurnScreen {
	create(cancelKey: string): Promise<{ id: string }>;
	edit(payload: ReturnType<typeof livePayload>): Promise<unknown>;
	confirm(title: string, description: string): Promise<boolean>;
}

export interface ChatTurnInvocation {
	runChatTurn: AiChat['runChatTurn'];
	registerChatAbort: AiChat['registerChatAbort'];
	releaseChatAbort: AiChat['releaseChatAbort'];
	config: ChatConfig;
	userId: string;
	channelId: string;
	prompt: string;
	images: readonly ChatImage[];
	toolContext: AiToolContext;
	author: string;
	screen: ChatTurnScreen;
	userMessageId?: string;
	excludeMessageId?: string;
}

export async function runChatTurnToScreen(invocation: ChatTurnInvocation): Promise<void> {
	const { key: cancelKey, controller } = invocation.registerChatAbort(invocation.userId);
	const edit = async (payload: ReturnType<typeof livePayload>) => {
		await invocation.screen.edit(payload).catch(() => undefined);
	};

	try {
		const live = await invocation.screen.create(cancelKey);

		let lastEditAt = 0;
		const onDelta = async (text: string) => {
			const now = Date.now();
			if (now - lastEditAt < invocation.config.streamUpdateMs || !text) return;
			lastEditAt = now;
			await edit(livePayload(text, cancelKey));
		};
		const onStatus = async (status: string) => {
			lastEditAt = Date.now();
			await edit(statusPayload(status, cancelKey));
		};

		let answer: string;
		let memoryUpdated = false;
		try {
			const turn = await invocation.runChatTurn({
				channelId: invocation.channelId,
				prompt: invocation.prompt,
				config: invocation.config,
				toolContext: invocation.toolContext,
				images: invocation.images,
				signal: controller.signal,
				author: invocation.author,
				assistantMessageId: live.id,
				...(invocation.userMessageId ? { userMessageId: invocation.userMessageId } : {}),
				...(invocation.excludeMessageId ? { excludeMessageId: invocation.excludeMessageId } : {}),
				confirmToolCall: (request) => {
					const { title, description } = toolConfirmText(request);
					return invocation.screen.confirm(title, description);
				},
				onDelta,
				onStatus
			});
			answer = turn.answer;
			memoryUpdated = turn.memoryUpdated;
		} catch (error) {
			if (error instanceof ChatServiceError) {
				await edit(error.identifier === 'chat_cancelled' ? stoppedPayload() : errorPayload(error.message));
				return;
			}
			await edit(errorPayload(GENERIC_ERROR_TEXT));
			throw error;
		}

		if (controller.signal.aborted) {
			await edit(stoppedPayload());
			return;
		}

		await edit(finalPayload(answer, { memoryUpdated }));
	} finally {
		invocation.releaseChatAbort(cancelKey);
	}
}
