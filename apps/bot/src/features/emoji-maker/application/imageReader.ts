import type { AppLogger } from '../../../lib/appLogger.ts';
import { fetchImageAsDataUrl } from '../../../lib/imageDataUrl.ts';
import { cleanTranslation, type TranslatorLlmConfig } from './promptTranslator.ts';

const VISION_TIMEOUT_MS = 30_000;

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
	getLlmConfig: () => TranslatorLlmConfig | null;
}

export interface ImageReader {
	isEnabled(): boolean;
	read(imageUrl: string, note?: string, typeHint?: string | null): Promise<ImageReading>;
}

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
