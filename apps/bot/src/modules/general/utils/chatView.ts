import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { appEmoji } from '@sirubot/utils';

const FINAL_SEGMENT_LIMIT = 3_900;
const MAX_FINAL_SEGMENTS = 4;
/** 생성 중 화면에 붙이는 타이핑 커서 — 최종 답변(finalPayload)에는 없어요 */
const TYPING_CURSOR = '▍';
export const CHAT_CANCEL_PREFIX = 'chatcancel:';

interface ChatPayload {
	components: (TextDisplayBuilder | ActionRowBuilder<ButtonBuilder>)[];
	flags: MessageFlags.IsComponentsV2;
	allowedMentions: { parse: [] };
}

/** 코드블록/줄 경계를 피해 안전하게 문단을 잘라요 (siru_lambda safeSplitMarkdown 방식) */
function splitTextForDisplay(text: string): string[] {
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

function payload(components: (TextDisplayBuilder | ActionRowBuilder<ButtonBuilder>)[]): ChatPayload {
	const flags = (MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications) as MessageFlags.IsComponentsV2;
	return { components, flags, allowedMentions: { parse: [] } };
}

/** 중지 버튼 행 — 컨테이너 없이 TextDisplay 바로 아래 최상단 ActionRow로 붙여요 */
function runningStopRow(cancelKey: string): ActionRowBuilder<ButtonBuilder> {
	const stopButton = new ButtonBuilder().setCustomId(`${CHAT_CANCEL_PREFIX}${cancelKey}`).setLabel('중지').setStyle(ButtonStyle.Secondary);
	return new ActionRowBuilder<ButtonBuilder>().addComponents(stopButton);
}

/** 스트리밍 중 본문 — 서두가 비면 생각 중 표시. 커서로 타이핑 감각을 내고 cancelKey를 주면 중지 버튼을 붙여요 */
export function livePayload(text: string, cancelKey?: string): ChatPayload {
	let body = text.trim() || '-# 시루가 생각 중..';
	// TextDisplay 상한(4000자)을 넘으면 라이브 화면은 첫 조각만 보여요 (최종본은 finalPayload가 청크 분할)
	if (body.length > 3900) body = splitTextForDisplay(body)[0] ?? body.slice(0, 3_900);
	const components: (TextDisplayBuilder | ActionRowBuilder<ButtonBuilder>)[] = [new TextDisplayBuilder().setContent(`${body}${TYPING_CURSOR}`)];
	if (cancelKey) components.push(runningStopRow(cancelKey));
	return payload(components);
}

/** 도구/작업 진행 상태 한 줄 — 커서를 붙여 진행 중임을 보여주고 cancelKey를 주면 중지 버튼을 붙여요 */
export function statusPayload(status: string, cancelKey?: string): ChatPayload {
	const components: (TextDisplayBuilder | ActionRowBuilder<ButtonBuilder>)[] = [
		new TextDisplayBuilder().setContent(`-# ${status}${TYPING_CURSOR}`)
	];
	if (cancelKey) components.push(runningStopRow(cancelKey));
	return payload(components);
}

/** 사용자가 중지 버튼을 눌렀을 때 */
export function stoppedPayload(): ChatPayload {
	return payload([new TextDisplayBuilder().setContent(`${appEmoji('scissors', '⏹️')} 응답을 중지했어요.`)]);
}

/** 최종 답변 — 청크별 TextDisplay 나열. memoryUpdated면 "(메모리 업데이트됨)" 각주를 붙여요 */
export function finalPayload(text: string, options?: { memoryUpdated?: boolean }): ChatPayload {
	const components = splitTextForDisplay(text.trim() || '…').map((chunk) => new TextDisplayBuilder().setContent(chunk));
	if (options?.memoryUpdated) components.push(new TextDisplayBuilder().setContent('-# (메모리 업데이트됨)'));
	return payload(components);
}

/** 오류 표시 */
export function errorPayload(message: string): ChatPayload {
	return payload([new TextDisplayBuilder().setContent(`${appEmoji('error', '❌')} ${message}`)]);
}
