import type { AiToolEffect } from '../aiTools/types.ts';

export interface ToolConfirmRequest {
	toolName: string;
	effect: AiToolEffect;
	summary: string;
	tainted: boolean;
}

export const TOOL_DENIED_OUTPUT = JSON.stringify({ status: 'denied', error: '사용자가 거절했어요. 이 작업은 실행하지 않았어요.' });

export function requiresConfirmation(effect: AiToolEffect | undefined, tainted: boolean): boolean {
	if (effect === 'settings') return true;
	if (effect === 'music') return tainted;
	return false;
}
