import { ChatServiceError, registerChatAbort, releaseChatAbort, runChatTurn, type ChatConfig } from '../../../services/aiChatService.ts';
import type { AiToolContext } from '../../../services/aiTools/index.ts';
import { errorPayload, finalPayload, livePayload, statusPayload, stoppedPayload } from './chatView.ts';

/** 예상 밖 오류가 났을 때 사용자 화면에 남기는 안내 — 진입점 2곳이 같은 문구를 쓴다. */
const GENERIC_ERROR_TEXT = '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';

/** 라이브 화면 스크린 — interaction(첫 defer+editReply)과 메시지(reply) 진입점의 차이를 감춘다. */
export interface ChatTurnScreen {
	/** 라이브 메시지를 만들고 메시지 id를 돌려줘요 (어시스턴트 기록에 쓰여요). 중지 버튼 키도 함께 전달해요. */
	create(cancelKey: string): Promise<{ id: string }>;
	/** 라이브/상태/최종 페이로드를 덮어써요. 실패는 조용히 무시해요. */
	edit(payload: ReturnType<typeof livePayload>): Promise<unknown>;
}

export interface ChatTurnInvocation {
	config: ChatConfig;
	userId: string;
	channelId: string;
	prompt: string;
	images: string[];
	toolContext: AiToolContext;
	/** 대화 기록에 남길 화자 표시명 */
	author: string;
	screen: ChatTurnScreen;
	/** 원문 Discord 메시지 ID — 삭제/편집 시 기록도 동기화돼요 (멘션 답변만) */
	userMessageId?: string;
	/** 채널 최근 채팅 블록에서 제외할 메시지 ID (멘션 답변만) */
	excludeMessageId?: string;
}

/**
 * 한 턴의 AI 대화를 라이브 화면에 흘려 보내는 공용 오케스트레이션.
 * `/채팅` 커맨드와 멘션 답변 리스너가 같은 순서(중지 키 등록 → 라이브 메시지 →
 * 스로틀된 스트리밍 편집 → 진행 상태 → 턴 실행 → 오류/중지 분기 → 최종 교체)로
 * 동작하고, 오류 분기(중지=교체, ChatServiceError=메시지 교체 후 종료,
 * 그 외=화면 교체 후 재던짐)도 한곳에서만 정의돼요.
 */
export async function runChatTurnToScreen(invocation: ChatTurnInvocation): Promise<void> {
	const { key: cancelKey, controller } = registerChatAbort(invocation.userId);
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
			const turn = await runChatTurn({
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
				onDelta,
				onStatus
			});
			answer = turn.answer;
			memoryUpdated = turn.memoryUpdated;
		} catch (error) {
			// 중지든 서비스 오류든 라이브 메시지를 그 자리에서 교체해 "생각 중"이 남지 않게 해요
			if (error instanceof ChatServiceError) {
				await edit(error.identifier === 'chat_cancelled' ? stoppedPayload() : errorPayload(error.message));
				return;
			}
			// 예상 밖 오류는 사용자에게 알린 뒤 호출자(로깅·정리)로 넘겨요
			await edit(errorPayload(GENERIC_ERROR_TEXT));
			throw error;
		}

		// 턴 도중/직후 중지가 수락됐으면 최종 답변으로 덮지 않아요
		if (controller.signal.aborted) {
			await edit(stoppedPayload());
			return;
		}

		await edit(finalPayload(answer, { memoryUpdated }));
	} finally {
		// 라이브 메시지 생성이 실패해도 abort 키가 새지 않도록 여기서 보장해요
		releaseChatAbort(cancelKey);
	}
}
