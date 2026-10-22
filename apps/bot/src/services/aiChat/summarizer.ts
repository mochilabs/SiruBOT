import { container } from '@sapphire/framework';
import { streamChatCompletion } from './completion.ts';
import { getStoredHistoryState, historyLine, persistChannelHistory } from './historyStore.ts';
import type { ChatConfig, ChatMessage } from './types.ts';

// 롤링 요약
const SUMMARY_SYSTEM_PROMPT = [
	'당신은 대화 요약기예요. 주어진 기존 요약과 새 대화를 한국어 하나의 요약으로 통합해요.',
	'규칙:',
	'- 이름·호칭·선호·취미·약속·결정·중요 사실·미결 질문은 빠짐없이 담아요.',
	'- 잡담·인사·반복은 버리고 사실 위주로, 400자 이내 한 문단으로 써요.',
	'- 목록·헤더·인용부호·추가 설명 없이 요약 본문만 출력해요.',
	'- 새로운 사실이 없으면 기존 요약을 그대로 반복해요.'
].join('\n');

/** 롤링 요약 — pending이 이 수 이상 쌓이면 백그라운드 요약 작업을 시작해요 */
const SUMMARY_MIN_BATCH = 6;
const SUMMARY_BATCH_SIZE = 12;

/** 한 채널에 요약 작업이 동시에 하나만 돌게 해요 */
const summaryJobs = new Set<string>();

function buildSummaryPrompt(existing: string | null, batch: ChatMessage[]): string {
	const parts: string[] = [];
	if (existing) parts.push('[기존 요약]', existing, '');
	parts.push('[새 대화]', ...batch.map(historyLine), '', '기존 요약과 새 대화를 통합한 최종 요약만 출력하세요.');
	return parts.join('\n');
}

/**
 * 요약 대기가 쌓이면 백그라운드에서 오래된 대화를 요약으로 압축해요.
 * 응답을 지연시키지 않도록 agentLoop에서 fire-and-forget으로 호출해요.
 */
export function scheduleSummary(channelId: string, config: ChatConfig): void {
	if (summaryJobs.has(channelId)) return;
	const state = getStoredHistoryState(channelId);
	if (!state || state.pending.length < SUMMARY_MIN_BATCH) return;
	summaryJobs.add(channelId);
	void runSummaryJob(channelId, config).finally(() => summaryJobs.delete(channelId));
}

async function runSummaryJob(channelId: string, config: ChatConfig): Promise<void> {
	for (;;) {
		const state = getStoredHistoryState(channelId);
		if (!state || state.pending.length < SUMMARY_MIN_BATCH) return;

		const batch = state.pending.splice(0, SUMMARY_BATCH_SIZE);
		try {
			const result = await streamChatCompletion({
				messages: [
					{ role: 'system', content: SUMMARY_SYSTEM_PROMPT },
					{ role: 'user', content: buildSummaryPrompt(state.summary, batch) }
				],
				config: { ...config, timeoutMs: Math.min(config.timeoutMs, 45_000) }
			});
			const summary = result.content.trim();
			if (!summary) throw new Error('empty summary');

			// 대기 중 턴이 끝나 기록이 교체됐을 수 있으니 최신 상태에만 써요.
			// (교체됐으면 batch는 DB에 그대로 남아 다음 사이클에서 재요약돼요)
			const current = getStoredHistoryState(channelId);
			if (!current) return;
			current.summary = summary;
			persistChannelHistory(channelId);
		} catch (error) {
			// 실패하면 같은 상태 객체에 되돌려 다음 턴에 재시도해요
			state.pending.unshift(...batch);
			persistChannelHistory(channelId);
			container.logger.warn('[aiChat] rolling summary failed:', error);
			return;
		}
	}
}
