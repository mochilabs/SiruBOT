import { createHash } from 'node:crypto';
import type { PrismaClient } from '@sirubot/prisma';
import { parseLrc } from '@sirubot/utils/lrc';
import { z } from 'zod';
import type { LyricsResult } from '../providers/types.ts';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('lyrics-translation');

export type LyricsTranslationStatus = 'ready' | 'pending' | 'none';

export interface LyricsTranslationResult {
	status: LyricsTranslationStatus;
	lines: Record<string, string> | null;
}

export interface LyricsTranslationProvider {
	readonly available: boolean;
	readonly model: string;
	chatCompletion(systemPrompt: string, userContent: string, providerLabel: string, options?: { responseFormat?: unknown }): Promise<string>;
}

const CHUNK_LINES = 60;
const CHUNK_CHARS = 5000;
const RETRY_AFTER_MS = 10 * 60 * 1000;
const MAX_LINES = 400;

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const LETTER = /\p{L}/u;

export function collectLyricLines(result: Pick<LyricsResult, 'plainLyrics' | 'syncedLyrics' | 'wordSync'>): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	const add = (raw: string) => {
		const text = raw.trim();
		if (!text || !LETTER.test(text) || seen.has(text)) return;
		seen.add(text);
		out.push(text);
	};
	for (const line of result.wordSync ?? []) add(line.text);
	if (result.syncedLyrics) for (const line of parseLrc(result.syncedLyrics)) add(line.text);
	if (result.plainLyrics) for (const line of result.plainLyrics.split(/\r?\n/)) add(line);
	return out;
}

export function isMostlyKorean(lines: string[]): boolean {
	let korean = 0;
	for (const line of lines) if (HANGUL.test(line)) korean++;
	return lines.length > 0 && korean / lines.length >= 0.5;
}

export function lyricsSourceHash(lines: string[]): string {
	return createHash('sha256').update(lines.join('\n')).digest('hex');
}

const SYSTEM_PROMPT = [
	'당신은 노래 가사를 한국어로 번역하는 전문가예요.',
	'입력은 JSON 배열이고 각 항목은 줄 번호 i와 원문 t예요.',
	'규칙:',
	'- 각 줄을 자연스러운 한국어로 옮겨요. 직역보다 노랫말다운 어조를 살리되 뜻을 바꾸지 않아요.',
	'- 이미 한국어인 줄, 의성어·추임새(la la la, 우우 등), 고유명사만 있는 줄은 원문 그대로 돌려줘요.',
	'- 줄 번호 i는 입력 그대로 되돌려요. 모든 줄을 빠짐없이, 줄 하나당 항목 하나로 돌려줘요. 줄을 합치거나 나누지 않아요.',
	'- 설명·주석·괄호 해설을 붙이지 않아요.',
	'- 출력은 {"items":[{"i":0,"t":"..."}, ...]} 형태의 JSON 객체 하나만, 마크다운 펜스 없이요.'
].join('\n');

const outputSchema = z.object({ items: z.array(z.object({ i: z.number().int(), t: z.string() })) });

const RESPONSE_FORMAT = {
	type: 'json_schema',
	json_schema: {
		name: 'lyrics_translation',
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
						required: ['i', 't'],
						properties: { i: { type: 'integer' }, t: { type: 'string' } }
					}
				}
			}
		}
	}
} as const;

export function parseLineTranslations(text: string, count: number): Map<number, string> | null {
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
	const parsed = outputSchema.safeParse(json);
	if (!parsed.success) return null;
	const map = new Map<number, string>();
	for (const item of parsed.data.items) if (item.i >= 0 && item.i < count && item.t.trim()) map.set(item.i, item.t.trim());
	return map.size > 0 ? map : null;
}

function chunkLines(lines: string[]): string[][] {
	const chunks: string[][] = [];
	let current: string[] = [];
	let chars = 0;
	for (const line of lines) {
		if (current.length > 0 && (current.length >= CHUNK_LINES || chars + line.length > CHUNK_CHARS)) {
			chunks.push(current);
			current = [];
			chars = 0;
		}
		current.push(line);
		chars += line.length;
	}
	if (current.length > 0) chunks.push(current);
	return chunks;
}

export class LyricsTranslator {
	private readonly inflight = new Map<string, Promise<void>>();
	private readonly failedAt = new Map<string, number>();

	public constructor(
		private readonly getDb: () => PrismaClient | null,
		private readonly provider: LyricsTranslationProvider
	) {}

	public async lookup(result: LyricsResult): Promise<LyricsTranslationResult> {
		const none: LyricsTranslationResult = { status: 'none', lines: null };
		const db = this.getDb();
		if (!db || !this.provider.available) return none;
		const lines = collectLyricLines(result);
		if (lines.length === 0 || lines.length > MAX_LINES || isMostlyKorean(lines)) return none;

		const hash = lyricsSourceHash(lines);
		try {
			const row = await db.lyricsTranslation.findUnique({ where: { sourceHash: hash } });
			if (row) return { status: 'ready', lines: row.lines as Record<string, string> };
		} catch (error) {
			logger.warn('lookup failed:', String(error));
			return none;
		}

		const hint = result.captionTranslation;
		if (hint && Object.keys(hint).length > 0) {
			try {
				await db.lyricsTranslation.upsert({
					where: { sourceHash: hash },
					create: { sourceHash: hash, lines: hint, model: 'youtube-captions' },
					update: {}
				});
				return { status: 'ready', lines: hint };
			} catch (error) {
				logger.warn('caption translation store failed:', String(error));
			}
		}

		if (this.inflight.has(hash)) return { status: 'pending', lines: null };
		const failed = this.failedAt.get(hash);
		if (failed && Date.now() - failed < RETRY_AFTER_MS) return none;

		const job = this.translateAndStore(db, hash, lines)
			.then(() => void this.failedAt.delete(hash))
			.catch((error) => {
				this.failedAt.set(hash, Date.now());
				logger.warn(`translate failed (${lines.length} lines):`, String(error));
			})
			.finally(() => void this.inflight.delete(hash));
		this.inflight.set(hash, job);
		return { status: 'pending', lines: null };
	}

	private async translateAndStore(db: PrismaClient, hash: string, lines: string[]): Promise<void> {
		const translations: Record<string, string> = {};
		for (const chunk of chunkLines(lines)) {
			const input = JSON.stringify(chunk.map((t, i) => ({ i, t })));
			let content: string;
			try {
				content = await this.provider.chatCompletion(SYSTEM_PROMPT, input, 'lyrics translation', { responseFormat: RESPONSE_FORMAT });
			} catch (error) {
				// Fall back to prompt-only JSON when the endpoint rejects response_format.
				if (!/failed: (?:400|422)\b/.test(String(error))) throw error;
				content = await this.provider.chatCompletion(SYSTEM_PROMPT, input, 'lyrics translation');
			}
			const map = parseLineTranslations(content, chunk.length);
			if (!map) throw new Error('lyrics translation output does not match the schema');
			for (const [i, text] of map) if (text !== chunk[i]) translations[chunk[i]!] = text;
		}
		if (Object.keys(translations).length === 0) throw new Error('no lines translated');
		await db.lyricsTranslation.upsert({
			where: { sourceHash: hash },
			create: { sourceHash: hash, lines: translations, model: this.provider.model },
			update: {}
		});
		logger.info(`translated ${Object.keys(translations).length}/${lines.length} lines via ${this.provider.model}`);
	}
}
