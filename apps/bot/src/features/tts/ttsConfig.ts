import { getConfig } from '../../lib/config.ts';
import type { TtsConfig } from './application/ttsService.ts';

export function getTtsConfig(): TtsConfig | null {
	const { url, defaultVoice } = getConfig().tts;
	if (!url) return null;
	return { url, defaultVoice };
}
