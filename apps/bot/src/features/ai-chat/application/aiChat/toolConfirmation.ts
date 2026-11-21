import type { AiToolEffect } from '../aiTools/types.ts';

/** 쓰기 도구를 실행하기 전에 요청자에게 물을 내용 — 화면 구성은 진입점(discord/)이 맡아요 */
export interface ToolConfirmRequest {
	toolName: string;
	effect: AiToolEffect;
	/** 사람이 읽는 호출 요약 (도구의 summarize 결과) */
	summary: string;
	/** 이 턴에 외부(웹) 내용이 이미 대화에 들어왔는지 */
	tainted: boolean;
}

/** 확인 요청이 거절·시간 초과·실패일 때 모델에 돌려주는 도구 결과 */
export const TOOL_DENIED_OUTPUT = JSON.stringify({ status: 'denied', error: '사용자가 거절했어요. 이 작업은 실행하지 않았어요.' });

/**
 * 확인이 필요한지 정해요 (결정 D-8).
 * - settings: 항상 확인
 * - music: 그 턴에 외부 내용이 들어왔을 때만 확인
 * - memory·read: 확인 없이 실행 (모르는 도구는 execute가 오류로 돌려줘요)
 */
export function requiresConfirmation(effect: AiToolEffect | undefined, tainted: boolean): boolean {
	if (effect === 'settings') return true;
	if (effect === 'music') return tainted;
	return false;
}
