import type { ChatMessage } from './types.ts';

/**
 * 도구 실행 결과 JSON 또는 텍스트에서 안전하게 객체를 파싱해요.
 */
function parseJsonResult(content: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(content) as unknown;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// non-json
	}
	return null;
}

/**
 * 모델이 도구를 실행한 후 빈 응답을 반환했거나 후속 텍스트를 생성하지 못했을 때,
 * 마지막으로 실행된 도구의 출력 결과에서 사용자가 읽을 수 있는 대체 텍스트를 추출해요.
 */
export function resolveFallbackTextFromToolResults(messages: ReadonlyArray<ChatMessage>): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (!m || m.role !== 'tool') continue;
		const content = typeof m.content === 'string' ? m.content.trim() : '';
		if (!content) continue;

		const parsed = parseJsonResult(content);
		if (parsed) {
			if (typeof parsed.error === 'string' && parsed.error.trim()) {
				return `요청을 처리하지 못했어요: ${parsed.error.trim()}`;
			}
			if (typeof parsed.message === 'string' && parsed.message.trim()) {
				return parsed.message.trim();
			}
			if (typeof parsed.text === 'string' && parsed.text.trim()) {
				return parsed.text.trim();
			}
			if (typeof parsed.status === 'string') {
				const status = parsed.status.toLowerCase();
				if (status === 'ok' || status === 'success') {
					return '요청하신 작업을 완료했어요.';
				}
				if (status === 'error' || status === 'fail') {
					return '요청을 처리하지 못했어요.';
				}
			}
			return '요청하신 작업을 완료했어요.';
		}

		if (content.startsWith('{') || content.startsWith('[')) {
			return '요청하신 작업을 완료했어요.';
		}
		return content.slice(0, 500);
	}
	return '';
}
