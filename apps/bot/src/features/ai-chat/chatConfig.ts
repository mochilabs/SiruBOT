import { getConfig } from '../../lib/config.ts';
import type { ChatConfig } from './application/aiChat/types.ts';

export function getChatConfig(): ChatConfig | null {
	const { apiUrl, apiKey, model, timeoutMs, streamUpdateMs, thinkToken } = getConfig().aiChat;
	if (!apiUrl || !model) return null;

	return { apiUrl, apiKey, model, timeoutMs, streamUpdateMs, thinkToken };
}
