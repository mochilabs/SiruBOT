import { createContainer } from '@sirubot/utils';
import type { ChatConfig } from '../../../services/aiChatService.ts';

const LIVE_TEXT_LIMIT = 3_800;
const FINAL_SEGMENT_LIMIT = 3_800;
const MAX_FINAL_SEGMENTS = 4;

export function chunkText(text: string): string[] {
	if (text.length <= FINAL_SEGMENT_LIMIT) return [text];
	const segments: string[] = [];
	let remaining = text;
	while (remaining.length > 0 && segments.length < MAX_FINAL_SEGMENTS) {
		segments.push(remaining.slice(0, FINAL_SEGMENT_LIMIT));
		remaining = remaining.slice(FINAL_SEGMENT_LIMIT);
	}
	if (remaining.length > 0) segments[MAX_FINAL_SEGMENTS - 1] = `${segments[MAX_FINAL_SEGMENTS - 1]}\n… (답장이 너무 길어 잘렸어요)`;
	return segments;
}

export function liveContainer(text: string, config: ChatConfig) {
	const shown = text.length > LIVE_TEXT_LIMIT ? `${text.slice(0, LIVE_TEXT_LIMIT)}…` : text;
	const container = createContainer();
	container.addTextDisplayComponents((t) =>
		t.setContent(['### 💬 시루', '', shown || '생각하는 중...', '', `-# ${config.model} · 답장 중...`].join('\n'))
	);
	return container;
}

export function finalContainer(text: string, config: ChatConfig, turnCount: number) {
	const segments = chunkText(text);
	const container = createContainer();
	container.addTextDisplayComponents((t) => t.setContent(['### 💬 시루', '', segments[0]].join('\n')));
	for (const segment of segments.slice(1)) {
		container.addTextDisplayComponents((t) => t.setContent(segment));
	}
	container.addTextDisplayComponents((t) => t.setContent(`-# ${config.model} · 이 채널 대화 기록 ${turnCount}턴 · \`/채팅 리셋:true\`로 초기화`));
	return container;
}

export function errorContainer(message: string, config: ChatConfig) {
	const container = createContainer();
	container.addTextDisplayComponents((t) => t.setContent(['### 💬 시루', '', `❌ ${message}`].join('\n')));
	container.addTextDisplayComponents((t) => t.setContent(`-# ${config.model}`));
	return container;
}
