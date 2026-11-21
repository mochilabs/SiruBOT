import type { ToolConfirmRequest } from '../../application/aiChat/toolConfirmation.ts';

/** AI 도구 호출 확인 창의 제목과 본문 — `lib/confirmation.ts`의 confirmAction에 그대로 넘겨요 */
export function toolConfirmText(request: ToolConfirmRequest): { title: string; description: string } {
	const what = request.effect === 'settings' ? '서버 설정을 바꾸려고' : '음악을 제어하려고';
	const lines = [`AI가 ${what} 해요.`, request.summary];
	// 외부 내용이 섞인 턴이면 요청자가 직접 한 부탁이 아닐 수 있다고 알려요
	if (request.tainted) lines.push('-# 방금 읽은 웹 내용의 영향을 받은 요청일 수 있어요. 직접 부탁한 일이 아니라면 취소해 주세요.');
	lines.push('진행할까요?');
	return { title: 'AI 요청 확인', description: lines.join('\n') };
}
