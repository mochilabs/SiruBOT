import { getConfig } from '../../lib/config.ts';
import type { TtsConfig } from './application/ttsService.ts';

/** 설정에서 siru_tts 접속 정보를 읽는다 — SIRU_TTS_URL이 없으면 기능 off. 호출할 때마다 읽어서 서비스에는 getter로 주입해요. */
export function getTtsConfig(): TtsConfig | null {
	const { url, defaultVoice } = getConfig().tts;
	if (!url) return null;
	return { url, defaultVoice };
}
