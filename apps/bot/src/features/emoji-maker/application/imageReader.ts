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

/**
 * 생성 모델(Tessera-small)은 Pixel Art Atlas의 짧은 명사구 캡션으로 학습했어요
 * (예: "silver twenty-sided die with beveled edges in bright colors", 평균 5단어, 최대 12단어).
 * 그래서 "pixel art" 같은 말을 붙이기보다 같은 문체로 색·재질·시점·특징을 담아야 더 또렷하게 나와요.
 * 텍스트 인코더(CLIP)가 24토큰까지만 읽어서 길이도 그 안에 맞춰요.
 */
const SYSTEM_PROMPT = [
	'You turn an image into a caption for a 16x16 pixel-art sprite generator, then check it for safety.',
	'',
	'Safety: set "nsfw" to true if the image shows nudity, sexual content, sexualized minors, gore, graphic violence, self-harm, or hate symbols, or if the user note asks for any of that.',
	'',
	'Caption ("prompt"): one English noun phrase of 5 to 12 words in this exact style:',
	'[optional view] [size/condition] [main color] [material] SUBJECT [with one distinctive feature] [optional "in warm colors" / "in bright colors" / "in high contrast"]',
	'Examples of the style:',
	'- front-view chubby orange tabby cat with round black sunglasses',
	'- glossy red apple with a single green leaf',
	'- angled wooden treasure chest with gold trim in warm colors',
	'- smiling yellow rubber duck with a tiny gold crown',
	'- cracked blue crystal sword with a glowing hilt in bright colors',
	'Rules:',
	'- Describe the one main subject only, as a single centered object or character. No background, scene, text, or logos.',
	'- Name concrete colors and materials you can see; keep the most recognizable feature.',
	'- People and characters: describe them generically (hair color, outfit, expression), never by name.',
	'- Do not write "pixel art", "sprite", "icon", "emoji", "16x16", or "image of".',
	'- Follow the user note, if any, for what to focus on or change.',
	'',
	'"subject": the bare subject in 1 to 3 words (e.g. "tabby cat"), used as the emoji name.',
	'',
	'Reply with JSON only, no markdown: {"nsfw": true|false, "prompt": "...", "subject": "..."}. When nsfw is true, prompt and subject may be empty.'
].join('\n');

/** subject는 이모지 이름 기본값에 쓰는 짧은 대상 이름이에요 (없을 수 있어요). */
export type ImageReading = { kind: 'ok'; prompt: string; subject: string | null } | { kind: 'nsfw' };

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
		const parsed = JSON.parse(text.slice(start, end + 1)) as { nsfw?: unknown; prompt?: unknown; subject?: unknown };
		if (typeof parsed.nsfw !== 'boolean') return null;
		if (parsed.nsfw) return { kind: 'nsfw' };
		const prompt = typeof parsed.prompt === 'string' ? cleanTranslation(parsed.prompt) : '';
		const subject = typeof parsed.subject === 'string' ? cleanTranslation(parsed.subject) || null : null;
		return prompt ? { kind: 'ok', prompt, subject } : null;
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
