import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { createContainer } from '@sirubot/utils';

const FINAL_SEGMENT_LIMIT = 3_900;
const MAX_FINAL_SEGMENTS = 4;
export const CHAT_CANCEL_PREFIX = 'chatcancel:';

export interface ChatPayload {
	components: (TextDisplayBuilder | ContainerBuilder)[];
	flags: MessageFlags.IsComponentsV2;
	allowedMentions: { parse: [] };
}

/** 코드블록/줄 경계를 피해 안전하게 문단을 잘라요 (siru_lambda safeSplitMarkdown 방식) */
export function splitTextForDisplay(text: string): string[] {
	if (text.length <= FINAL_SEGMENT_LIMIT) return [text];
	const chunks: string[] = [];
	let remaining = text;
	let inFence = false;
	while (remaining.length > 0 && chunks.length < MAX_FINAL_SEGMENTS) {
		if (remaining.length <= FINAL_SEGMENT_LIMIT) {
			chunks.push(remaining);
			break;
		}
		let breakIdx = -1;
		const slice = remaining.slice(0, FINAL_SEGMENT_LIMIT);
		const fenceRegex = /```/g;
		while (fenceRegex.exec(slice) !== null) {
			inFence = !inFence;
		}
		if (!inFence) {
			breakIdx = remaining.lastIndexOf('\n', FINAL_SEGMENT_LIMIT);
			if (breakIdx < FINAL_SEGMENT_LIMIT * 0.5) {
				breakIdx = remaining.lastIndexOf(' ', FINAL_SEGMENT_LIMIT);
			}
		} else {
			const fenceStart = remaining.lastIndexOf('```', FINAL_SEGMENT_LIMIT);
			if (fenceStart > FINAL_SEGMENT_LIMIT * 0.3) breakIdx = fenceStart;
		}
		if (breakIdx < Math.floor(FINAL_SEGMENT_LIMIT * 0.3)) breakIdx = FINAL_SEGMENT_LIMIT;
		const chunk = remaining.slice(0, breakIdx).trimEnd();
		chunks.push(chunk || remaining.slice(0, FINAL_SEGMENT_LIMIT));
		remaining = remaining.slice(breakIdx).trimStart();
	}
	if (remaining && chunks.length >= MAX_FINAL_SEGMENTS) {
		chunks[MAX_FINAL_SEGMENTS - 1] = `${chunks[MAX_FINAL_SEGMENTS - 1]}\n… (답장이 너무 길어 잘렸어요)`;
	}
	return chunks.length > 0 ? chunks : ['…'];
}

function payload(components: (TextDisplayBuilder | ContainerBuilder)[]): ChatPayload {
	const flags = (MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications) as MessageFlags.IsComponentsV2;
	return { components, flags, allowedMentions: { parse: [] } };
}

/** 중지 버튼이 붙은 컨테이너 — 생성 중 화면 전용 */
function runningContainer(text: string, cancelKey: string): ContainerBuilder {
	const stopButton = new ButtonBuilder()
		.setCustomId(`${CHAT_CANCEL_PREFIX}${cancelKey}`)
		.setLabel('중지')
		.setStyle(ButtonStyle.Danger)
		.setEmoji('⏹️');
	return createContainer()
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
		.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(stopButton));
}

/** 스트리밍 중 본문 — 서두가 비면 생각 중 표시. cancelKey를 주면 중지 버튼을 붙여요 */
export function livePayload(text: string, cancelKey?: string): ChatPayload {
	const body = text.trim() || '⏳ 생각하는 중...';
	return payload(cancelKey ? [runningContainer(body, cancelKey)] : [new TextDisplayBuilder().setContent(body)]);
}

/** 도구/작업 진행 상태 한 줄 — cancelKey를 주면 중지 버튼을 붙여요 */
export function statusPayload(status: string, cancelKey?: string): ChatPayload {
	const body = `-# ⏳ ${status}`;
	return payload(cancelKey ? [runningContainer(body, cancelKey)] : [new TextDisplayBuilder().setContent(body)]);
}

/** 사용자가 중지 버튼을 눌렀을 때 */
export function stoppedPayload(): ChatPayload {
	return payload([new TextDisplayBuilder().setContent('⏹️ 응답을 중지했어요.')]);
}

/** 최종 답변 — 청크별 TextDisplay 나열. memoryUpdated면 "(메모리 업데이트됨)" 각주를 붙여요 */
export function finalPayload(text: string, options?: { memoryUpdated?: boolean }): ChatPayload {
	const components = splitTextForDisplay(text.trim() || '…').map((chunk) => new TextDisplayBuilder().setContent(chunk));
	if (options?.memoryUpdated) components.push(new TextDisplayBuilder().setContent('-# (메모리 업데이트됨)'));
	return payload(components);
}

/** 오류 표시 */
export function errorPayload(message: string): ChatPayload {
	return payload([new TextDisplayBuilder().setContent(`❌ ${message}`)]);
}
