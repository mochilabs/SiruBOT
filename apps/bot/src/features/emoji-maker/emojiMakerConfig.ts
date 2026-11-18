import { getConfig } from '../../lib/config.ts';
import type { MojiConfig } from './application/mojiClient.ts';
import type { TranslatorLlmConfig } from './application/promptTranslator.ts';

/** siru_moji 접속 정보 — SIRU_MOJI_URL이 없으면 기능 off. 호출할 때마다 읽어서 서비스에는 getter로 주입해요. */
export function getMojiConfig(): MojiConfig | null {
	const { url, authKey } = getConfig().moji;
	if (!url) return null;
	return { url, authKey };
}

/** 설명 번역에 쓰는 LLM — AI 채팅 설정을 그대로 빌려 써요. 모델이나 URL이 비면 번역 off. */
export function getTranslatorLlmConfig(): TranslatorLlmConfig | null {
	const { apiUrl, apiKey, model } = getConfig().aiChat;
	if (!apiUrl || !model) return null;
	return { apiUrl, apiKey, model };
}
