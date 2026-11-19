import type { AppLogger } from '../../../lib/appLogger.ts';
import { fetchImageAsDataUrl } from '../../../lib/imageDataUrl.ts';
import { cleanTranslation, type TranslatorLlmConfig } from './promptTranslator.ts';

/**
 * 첨부 이미지를 비전 모델(AI 채팅과 같은 OpenAI 호환 엔드포인트)로 읽어 이모지용 영어 설명을 만들고,
 * 같은 호출에서 부적절한(NSFW) 이미지인지 판정해요.
 *
 * 판정이 안전망이라 실패하면 닫혀요: LLM이 꺼져 있거나, 응답이 없거나, JSON을 해석하지 못하면
 * 확인하지 못한 이미지로 그리지 않고 오류를 돌려줘요.
 */

const VISION_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = [
	'You look at an image and turn it into a prompt for a tiny 16x16 pixel-art emoji generator.',
	'First decide if the image is NSFW: nudity, sexual content, sexualized minors, gore, graphic violence, self-harm, or hate symbols.',
	'If the user note asks for any of that, treat it as NSFW too.',
	'Then describe the main subject as one short English phrase (at most 12 words), e.g. "orange cat wearing sunglasses".',
	'Use the user note, if any, to decide what to focus on or change.',
	'Reply with JSON only, no markdown: {"nsfw": true|false, "prompt": "..."}. When nsfw is true, prompt may be empty.'
].join('\n');

export type ImageReading = { kind: 'ok'; prompt: string } | { kind: 'nsfw' };

export type ImageReaderErrorCode = 'not_configured' | 'failed';

export class ImageReaderError extends Error {
	public constructor(
		public readonly code: ImageReaderErrorCode,
		message: string,
		options?: { cause?: unknown }
	) {
		super(message, options);
		this.name = 'ImageReaderError';
	}
}

export interface ImageReaderDeps {
	logger: AppLogger;
	/** 모델이나 URL이 비면 null — 이미지로 만들기를 쓸 수 없어요. */
	getLlmConfig: () => TranslatorLlmConfig | null;
}

export interface ImageReader {
	isEnabled(): boolean;
	/** typeHint는 디스코드 첨부의 contentType — 응답 헤더에 형식이 없을 때만 써요. */
	read(imageUrl: string, note?: string, typeHint?: string | null): Promise<ImageReading>;
}

/** 모델 답에서 JSON 객체를 꺼내요. 생각 토큰·코드 펜스가 섞여 있어도 첫 `{`부터 마지막 `}`까지 읽어요. */
export function parseImageReading(raw: string): ImageReading | null {
	const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start === -1 || end <= start) return null;
	try {
		const parsed = JSON.parse(text.slice(start, end + 1)) as { nsfw?: unknown; prompt?: unknown };
		if (typeof parsed.nsfw !== 'boolean') return null;
		if (parsed.nsfw) return { kind: 'nsfw' };
		const prompt = typeof parsed.prompt === 'string' ? cleanTranslation(parsed.prompt) : '';
		return prompt ? { kind: 'ok', prompt } : null;
	} catch {
		return null;
	}
}

export function createImageReader(deps: ImageReaderDeps): ImageReader {
	return {
		isEnabled: () => deps.getLlmConfig() !== null,
		async read(imageUrl, note, typeHint) {
			const config = deps.getLlmConfig();
			if (!config) throw new ImageReaderError('not_configured', 'vision LLM is not configured');
			const userText = note?.trim() ? `User note: ${note.trim()}` : 'No user note.';
			let content: string;
			try {
				const dataUrl = await fetchImageAsDataUrl(imageUrl, typeHint);
				const res = await fetch(`${config.apiUrl}/chat/completions`, {
					method: 'POST',
					headers: { 'content-type': 'application/json', ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) },
					body: JSON.stringify({
						model: config.model,
						messages: [
							{ role: 'system', content: SYSTEM_PROMPT },
							{
								role: 'user',
								content: [
									{ type: 'text', text: userText },
									{ type: 'image_url', image_url: { url: dataUrl } }
								]
							}
						],
						stream: false,
						temperature: 0
					}),
					signal: AbortSignal.timeout(VISION_TIMEOUT_MS)
				});
				if (!res.ok) {
					const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
					throw new Error(`HTTP ${res.status}${detail ? ` ${detail}` : ''}`);
				}
				const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
				content = body.choices?.[0]?.message?.content ?? '';
			} catch (error) {
				throw new ImageReaderError('failed', `vision request failed: ${error}`, { cause: error });
			}
			const reading = parseImageReading(content);
			if (!reading) {
				deps.logger.warn(`[emoji-maker] 이미지 판독 응답을 해석하지 못했어요: ${JSON.stringify(content.slice(0, 200))}`);
				throw new ImageReaderError('failed', 'unreadable vision response');
			}
			return reading;
		}
	};
}
