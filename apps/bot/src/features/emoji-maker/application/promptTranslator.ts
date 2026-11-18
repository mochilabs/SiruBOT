import type { AppLogger } from '../../../lib/appLogger.ts';

/**
 * 이모지 설명을 영어로 옮겨요. 생성 모델의 텍스트 인코더(CLIP)가 영어만 제대로 알아들어서,
 * 한글이 섞인 설명은 AI 채팅과 같은 OpenAI 호환 엔드포인트로 짧은 영어 문구로 바꿔 보내요.
 * LLM이 꺼져 있거나 실패하면 원문을 그대로 써요 — 번역 실패로 생성까지 막지는 않아요.
 */

const TRANSLATE_TIMEOUT_MS = 15_000;
const MAX_PROMPT_LENGTH = 200;
const HANGUL = /\p{Script=Hangul}/u;

const SYSTEM_PROMPT = [
	'You translate short emoji descriptions into English for a pixel-art emoji generator.',
	'Reply with one short English phrase (at most 12 words) describing the subject, e.g. "cat wearing sunglasses".',
	'No quotes, no punctuation at the end, no explanations.'
].join('\n');

export interface TranslatorLlmConfig {
	apiUrl: string;
	apiKey: string;
	model: string;
}

export interface PromptTranslatorDeps {
	logger: AppLogger;
	/** 모델이나 URL이 비어 있으면 null(번역 off). */
	getLlmConfig: () => TranslatorLlmConfig | null;
}

export interface TranslatedPrompt {
	prompt: string;
	translated: boolean;
}

export interface PromptTranslator {
	toEnglish(text: string): Promise<TranslatedPrompt>;
}

/** 모델 답에서 생각 토큰·따옴표·여러 줄을 걷어내고 첫 줄만 남겨요. */
export function cleanTranslation(raw: string): string {
	const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
	const firstLine = withoutThink.split('\n').find((line) => line.trim()) ?? '';
	return firstLine
		.trim()
		.replace(/^["'`“”‘’]+|["'`“”‘’.]+$/g, '')
		.trim()
		.slice(0, MAX_PROMPT_LENGTH);
}

export function createPromptTranslator(deps: PromptTranslatorDeps): PromptTranslator {
	return {
		async toEnglish(text) {
			const original = { prompt: text, translated: false };
			if (!HANGUL.test(text)) return original;
			const config = deps.getLlmConfig();
			if (!config) return original;
			try {
				const res = await fetch(`${config.apiUrl}/chat/completions`, {
					method: 'POST',
					headers: { 'content-type': 'application/json', ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) },
					body: JSON.stringify({
						model: config.model,
						messages: [
							{ role: 'system', content: SYSTEM_PROMPT },
							{ role: 'user', content: text }
						],
						stream: false,
						temperature: 0
					}),
					signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS)
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
				const prompt = cleanTranslation(body.choices?.[0]?.message?.content ?? '');
				// 번역 결과에 한글이 남아 있으면 모델이 지시를 안 따른 거라 원문보다 나을 게 없어요.
				if (!prompt || HANGUL.test(prompt)) throw new Error(`unusable translation: ${JSON.stringify(prompt)}`);
				return { prompt, translated: true };
			} catch (error) {
				deps.logger.warn(`[emoji-maker] 설명 번역 실패, 원문으로 그려요: ${error}`);
				return original;
			}
		}
	};
}
