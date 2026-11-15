import { getConfig } from '../../lib/config.ts';
import type { ChatConfig } from './application/aiChat/types.ts';

/** 설정에서 AI 채팅 접속 정보를 읽어요. 필수값(API URL·모델)이 없으면 null — 호출할 때마다 읽어요. */
export function getChatConfig(): ChatConfig | null {
	const { apiUrl, apiKey, model, timeoutMs, streamUpdateMs, thinkToken } = getConfig().aiChat;
	if (!apiUrl || !model) return null;

	return { apiUrl, apiKey, model, timeoutMs, streamUpdateMs, thinkToken };
}
