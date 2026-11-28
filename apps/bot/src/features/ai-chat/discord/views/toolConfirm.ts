import type { ToolConfirmRequest } from '../../application/aiChat/toolConfirmation.ts';

export function toolConfirmText(request: ToolConfirmRequest): { title: string; description: string } {
	const what = request.effect === 'settings' ? '서버 설정을 바꾸려고' : '음악을 제어하려고';
	const lines = [`AI가 ${what} 해요.`, request.summary];
	if (request.tainted) lines.push('-# 방금 읽은 웹 내용의 영향을 받은 요청일 수 있어요. 직접 부탁한 일이 아니라면 취소해 주세요.');
	lines.push('진행할까요?');
	return { title: 'AI 요청 확인', description: lines.join('\n') };
}
