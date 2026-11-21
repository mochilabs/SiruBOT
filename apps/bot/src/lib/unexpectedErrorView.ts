import { container } from '@sapphire/framework';
import { getConfig } from './config.ts';
import { errorView, type ErrorViewOptions } from './errorView.ts';

/**
 * 예기치 못한 오류 화면 (P-14) — 지원 서버 링크 버튼과 장애 공지 한 줄을 붙여요.
 * 사용자 입력 검증 같은 흔한 안내는 `errorView`를 그대로 써요. 공지 조회가 실패해도 오류 화면은 그대로 나가요.
 */
export async function unexpectedErrorView(message: string, options: Pick<ErrorViewOptions, 'accentColor'> = {}) {
	const text = await container.incidentNotice.appendTo(message).catch(() => message);
	return errorView(text, { ...options, supportUrl: getConfig().links.supportServerUrl });
}
