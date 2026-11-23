import { z } from 'zod';

import { getLogger } from '../utils/logger.ts';
import type { DailyHoroscope } from './types.ts';

const logger = getLogger('translate');

export interface TranslationItem {
	zodiacCode: string;
	content: string;
	lucky: string;
}

export interface ChatCompletionOptions {
	/** OpenAI `response_format` — Structured Outputs를 쓸 때 넘겨요. */
	responseFormat?: unknown;
}

/** 번역 프로바이더 추상화 — 구현 교체 지점 (현재 OpenAI 호환 엔드포인트만 구현, 별도 환경변수 없음). */
export interface TranslationProvider {
	readonly name: string;
	readonly available: boolean;
	translateHoroscope(items: TranslationItem[]): Promise<Map<string, TranslationItem>>;
	/** OpenAI 호환 chat/completions 공용 호출: 운세 번역과 장기 기억 정리가 같은 경로를 써요. */
	chatCompletion(systemPrompt: string, userContent: string, providerLabel: string, options?: ChatCompletionOptions): Promise<string>;
}

const TRANSLATE_SYSTEM_PROMPT = [
	'당신은 일본어 별자리 운세를 한국어로 번역하는 전문가예요.',
	'입력은 JSON 배열이고 각 항목의 zodiacCode, content(운세 본문), lucky(럭키 원문)를 담고 있어요.',
	'규칙:',
	'- content는 자연스러운 한국어로 옮겨요. "~일 거예요", "~에 주의하세요" 같은 점괘 특유의 어조를 살려요.',
	'- lucky 원문에서 정보를 나눠 luckyColor(럭키 컬러: ラッキーカラー), luckyKey(행운의 열쇠: 幸運のカギ), luckyItem(럭키 아이템: ラッキーアイテム 또는 라벨 없는 단일 항목)에 각각 한국어 값만 담아요. 라벨 글자는 넣지 않아요.',
	'- 원문에 없는 항목은 빈 문자열로 둬요. 원문에 없는 내용을 만들거나 추가하지 않아요.',
	'- zodiacCode는 입력 그대로 되돌려요 (예: "01"). 입력의 모든 항목을 빠짐없이 돌려줘요.',
	'- 출력은 {"items":[{"zodiacCode":"01","content":"...","luckyColor":"...","luckyKey":"...","luckyItem":"..."}, ...]} 형태의 JSON 객체 하나만, 설명·마크다운 펜스 없이요.'
].join('\n');

const translationItemSchema = z.object({
	zodiacCode: z.string(),
	content: z.string(),
	luckyColor: z.string(),
	luckyKey: z.string(),
	luckyItem: z.string()
});
const translationOutputSchema = z.object({ items: z.array(translationItemSchema) });

/** Structured Outputs(json_schema, strict) 요청 형식 — 최상위는 객체여야 해서 items로 감싸요. */
const TRANSLATION_RESPONSE_FORMAT = {
	type: 'json_schema',
	json_schema: {
		name: 'horoscope_translation',
		strict: true,
		schema: {
			type: 'object',
			additionalProperties: false,
			required: ['items'],
			properties: {
				items: {
					type: 'array',
					items: {
						type: 'object',
						additionalProperties: false,
						required: ['zodiacCode', 'content', 'luckyColor', 'luckyKey', 'luckyItem'],
						properties: {
							zodiacCode: { type: 'string' },
							content: { type: 'string' },
							luckyColor: { type: 'string' },
							luckyKey: { type: 'string' },
							luckyItem: { type: 'string' }
						}
					}
				}
			}
		}
	}
} as const;

/** 구조화 필드를 봇·카드가 읽는 기존 lucky 문자열로 조립해요 (봇 splitOhaasaLucky가 이 라벨을 알아봐요). */
export function composeLucky(f: { luckyColor: string; luckyKey: string; luckyItem: string }): string {
	const parts: string[] = [];
	const color = f.luckyColor.trim();
	const key = f.luckyKey.trim();
	const item = f.luckyItem.trim();
	if (color) parts.push(`럭키 컬러: ${color}`);
	if (key) parts.push(`행운의 열쇠: ${key}`);
	if (item) parts.push(`럭키 아이템: ${item}`);
	return parts.join(' · ');
}

/** 모델 출력 파싱 — strict 응답은 그대로 통과하고, 미지원 엔드포인트의 펜스·앞뒤 설명은 벗겨내요. */
export function parseTranslation(text: string): Map<string, TranslationItem> | null {
	const stripped = text.replace(/```(?:json)?/gi, '').trim();
	const start = stripped.indexOf('{');
	const end = stripped.lastIndexOf('}');
	if (start === -1 || end <= start) return null;
	let json: unknown;
	try {
		json = JSON.parse(stripped.slice(start, end + 1));
	} catch {
		return null;
	}
	const parsed = translationOutputSchema.safeParse(json);
	if (!parsed.success) return null;
	const map = new Map<string, TranslationItem>();
	for (const e of parsed.data.items) {
		const code = /^\d$/.test(e.zodiacCode) ? e.zodiacCode.padStart(2, '0') : e.zodiacCode;
		map.set(code, { zodiacCode: code, content: e.content, lucky: composeLucky(e) });
	}
	return map.size > 0 ? map : null;
}

export class OpenAICompatTranslationProvider implements TranslationProvider {
	public readonly name = 'openai';
	public readonly available: boolean;

	public constructor(
		public readonly baseUrl: string,
		public readonly apiKey: string,
		public readonly model: string
	) {
		this.available = apiKey.length > 0;
	}

	/**
	 * OpenAI 호환 chat/completions 공용 호출 — 이 프로바이더를 쓰는 모든 호출부
	 * (운세 번역·장기 기억 정리)가 같은 경로를 공유해요. 60초 타임아웃, 스트림 비활성.
	 * providerLabel은 실패 시 에러 메시지에 쓰여요 (예: 'translation provider').
	 */
	public async chatCompletion(systemPrompt: string, userContent: string, providerLabel: string, options?: ChatCompletionOptions): Promise<string> {
		const res = await fetch(`${this.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {})
			},
			body: JSON.stringify({
				model: this.model,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userContent }
				],
				stream: false,
				...(options?.responseFormat ? { response_format: options.responseFormat } : {})
			}),
			signal: AbortSignal.timeout(60_000)
		});
		if (!res.ok) {
			// 실패 본문까지 남겨야 quota 초과(429 insufficient_quota)·인증 오류가 로그에서 바로 보여요
			const detail = await res.text().catch(() => '');
			const snippet = detail.replace(/\s+/g, ' ').trim().slice(0, 500);
			throw new Error(`${providerLabel} failed: ${res.status}${snippet ? ` ${snippet}` : ''}`);
		}
		const body = (await res.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		return body.choices?.[0]?.message?.content ?? '';
	}

	public async translateHoroscope(items: TranslationItem[]): Promise<Map<string, TranslationItem>> {
		const input = JSON.stringify(items);
		let content: string;
		try {
			content = await this.chatCompletion(TRANSLATE_SYSTEM_PROMPT, input, 'translation provider', {
				responseFormat: TRANSLATION_RESPONSE_FORMAT
			});
		} catch (error) {
			// response_format(json_schema)를 모르는 호환 서버는 400/422를 줘요 — 프롬프트 지시만으로 한 번 더 시도해요
			if (!/failed: (?:400|422)\b/.test(String(error))) throw error;
			logger.warn('structured output rejected, retrying with prompt-only JSON:', String(error));
			content = await this.chatCompletion(TRANSLATE_SYSTEM_PROMPT, input, 'translation provider');
		}
		const map = parseTranslation(content);
		if (!map) throw new Error('translation output does not match the schema');
		return map;
	}
}

/** 번역본 조립 — 한 건이라도 성공하면 translated:true, 전부 실패 시 throw */
export async function translateDaily(raw: DailyHoroscope, provider: TranslationProvider): Promise<DailyHoroscope> {
	const items: TranslationItem[] = raw.horoscopes
		.filter((h) => h.content || h.lucky)
		.map((h) => ({
			zodiacCode: h.zodiacCode,
			content: h.content,
			lucky: h.lucky
		}));
	if (items.length === 0) return raw;

	const map = await provider.translateHoroscope(items);
	let translatedCount = 0;
	const horoscopes = raw.horoscopes.map((h) => {
		const t = map.get(h.zodiacCode);
		if (!t) return h;
		translatedCount++;
		return { ...h, content: t.content || h.content, lucky: t.lucky || h.lucky };
	});
	if (translatedCount === 0) throw new Error('no items translated');
	logger.info(`translated ${translatedCount}/${raw.horoscopes.length} items via ${provider.name}`);
	return { ...raw, horoscopes, translated: true };
}
