import { getConfig } from '../../lib/config.ts';
import type { MojiConfig } from './application/mojiClient.ts';
import type { TranslatorLlmConfig } from './application/promptTranslator.ts';

export function getMojiConfig(): MojiConfig | null {
	const { url, authKey } = getConfig().moji;
	if (!url) return null;
	return { url, authKey };
}

export function getTranslatorLlmConfig(): TranslatorLlmConfig | null {
	const { apiUrl, apiKey, model } = getConfig().aiChat;
	if (!apiUrl || !model) return null;
	return { apiUrl, apiKey, model };
}
