import type { AppLogger } from '../../../lib/appLogger.ts';
import { cleanTranslation, type TranslatorLlmConfig } from './promptTranslator.ts';

/**
 * 첨부 이미지를 비전 모델(AI 채팅과 같은 OpenAI 호환 엔드포인트)로 읽어 이모지용 영어 설명을 만들고,
 * 같은 호출에서 부적절한(NSFW) 이미지인지 판정해요.
 *
 * 판정이 안전망이라 실패하면 닫혀요: LLM이 꺼져 있거나, 응답이 없거나, JSON을 해석하지 못하면
 * 확인하지 못한 이미지로 그리지 않고 오류를 돌려줘요.
 */

const VISION_TIMEOUT_MS = 30_000;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;
/** AI 채팅이 받는 이미지 상한과 같아요. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** 주요 비전 모델(Gemini·OpenAI 등)이 공통으로 받는 형식 — GIF는 Gemini가 거절해서 받지 않아요. */
export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** content-type 헤더에서 지원하는 이미지 형식만 골라요 (`image/jpg` 같은 변형도 받아요). */
export function normalizeImageType(raw: string | null | undefined): (typeof SUPPORTED_IMAGE_TYPES)[number] | null {
	const type = (raw ?? '').split(';')[0]!.trim().toLowerCase();
	if (type === 'image/jpg' || type === 'image/pjpeg') return 'image/jpeg';
	return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(type) ? (type as (typeof SUPPORTED_IMAGE_TYPES)[number]) : null;
}

/**
 * 첨부 이미지를 내려받아 `data:` URL로 바꿔요. URL을 그대로 넘기면 LLM 프록시가 형식을 몰라
 * `image/*`로 보내고, Gemini 같은 제공자가 400으로 거절해요. 직접 받아서 실제 형식을 붙여 보내요.
 */
async function toDataUrl(imageUrl: string, typeHint?: string | null): Promise<string> {
	const res = await fetch(imageUrl, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
	if (!res.ok) throw new Error(`image download HTTP ${res.status}`);
	const declared = Number(res.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) throw new Error(`image too large: ${declared} bytes`);
	const bytes = Buffer.from(await res.arrayBuffer());
	if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`image too large: ${bytes.length} bytes`);
	const type = normalizeImageType(res.headers.get('content-type')) ?? normalizeImageType(typeHint);
	if (!type) throw new Error(`unsupported image type: ${res.headers.get('content-type') ?? typeHint ?? 'unknown'}`);
	return `data:${type};base64,${bytes.toString('base64')}`;
}

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
				const dataUrl = await toDataUrl(imageUrl, typeHint);
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
