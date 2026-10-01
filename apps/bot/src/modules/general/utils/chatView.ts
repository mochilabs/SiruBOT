import { MessageFlags, TextDisplayBuilder } from 'discord.js';

const FINAL_SEGMENT_LIMIT = 3_900;
const MAX_FINAL_SEGMENTS = 4;

export interface ChatPayload {
	components: TextDisplayBuilder[];
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

function payload(components: TextDisplayBuilder[]): ChatPayload {
	const flags = (MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications) as MessageFlags.IsComponentsV2;
	return { components, flags, allowedMentions: { parse: [] } };
}

/** 스트리밍 중 본문 — 서두가 비면 생각 중 표시 */
export function livePayload(text: string): ChatPayload {
	return payload([new TextDisplayBuilder().setContent(text.trim() || '⏳ 생각하는 중...')]);
}

/** 도구/작업 진행 상태 한 줄 */
export function statusPayload(status: string): ChatPayload {
	return payload([new TextDisplayBuilder().setContent(`-# ⏳ ${status}`)]);
}

/** 최종 답변 — 청크별 TextDisplay 나열 */
export function finalPayload(text: string): ChatPayload {
	return payload(splitTextForDisplay(text.trim() || '…').map((chunk) => new TextDisplayBuilder().setContent(chunk)));
}

/** 오류 표시 */
export function errorPayload(message: string): ChatPayload {
	return payload([new TextDisplayBuilder().setContent(`❌ ${message}`)]);
}
