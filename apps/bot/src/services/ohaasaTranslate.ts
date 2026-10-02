import { container } from '@sapphire/framework';
import { fetchOhaasa, type DailyHoroscope } from '../modules/games/utils/ohaasaService.ts';
import { getChatConfig, streamChatCompletion, type ChatConfig } from './aiChatService.ts';

/** Redis 키: 날짜별 한국어 번역본 (재시작·셰드 간 공유) */
const REDIS_PREFIX = 'ohaasa:ko:';
const REDIS_TTL_SECONDS = 7 * 24 * 3600;
const LOCK_TTL_SECONDS = 90;
const LOCK_POLL_MS = 500;
const LOCK_POLL_TRIES = 24;
/** 번역 실패 시 재시도 간격 — 잦은 LLM 호출을 막아요 */
const RETRY_AFTER_MS = 10 * 60 * 1000;
/** 다음 날 새 운세가 올라올 시간 — KST 06:50 (JST 07:50) + 지터 */
const PREFETCH_HOUR_KST = 6;
const PREFETCH_MINUTE_KST = 50;
const PREFETCH_JITTER_MAX_MS = 20 * 60_000;

const TRANSLATE_SYSTEM_PROMPT = [
	'당신은 일본어 별자리 운세를 한국어로 번역하는 전문가예요.',
	'입력은 JSON 배열이고 각 항목의 zodiacCode, content(운세 본문), lucky(럭키 정보)를 담고 있어요.',
	'규칙:',
	'- content와 lucky만 자연스러운 한국어로 옮겨요. "~일 거예요", "~에 주의하세요" 같은 점괘 특유의 어조를 살려요.',
	'- lucky는 "럭키 컬러: 빨강 · 행운의 열쇠: 친구"처럼 정보를 빠짐없이 옮기되, 원문에 없는 항목을 만들지 않아요.',
	'- zodiacCode는 입력 그대로 되돌려요 (예: "01"). rank는 입력에 없으니 포함하지 않아요.',
	'- 원문에 없는 내용을 추가하지 않고, 빈 문자열은 빈 문자열로 둬요.',
	'- 출력은 [{"zodiacCode":"01","content":"...","lucky":"..."}, ...] 형태의 JSON 배열 하나만, 설명·마크다운 펜스 없이요.'
].join('\n');

type TranslatedItem = { zodiacCode: string; content: string; lucky: string };

/** 마지막 번역 실패 시각 — 짧은 간격 재시도 방지 */
let failedAt = 0;
let cachedKo: { date: string; daily: DailyHoroscope } | null = null;

function cacheKey(date: string): string {
	return `${REDIS_PREFIX}${date.replace(/\//g, '')}`;
}

function lockKey(date: string): string {
	return `${cacheKey(date)}:lock`;
}

function parseCached(value: string): DailyHoroscope | null {
	try {
		const parsed = JSON.parse(value) as DailyHoroscope;
		if (parsed && Array.isArray(parsed.horoscopes) && typeof parsed.date === 'string') return parsed;
	} catch {
		// 손상된 캐시는 버려요
	}
	return null;
}

/** 모델 출력에서 JSON 배열을 파싱해요 (펜스·설명 끼어 있어도 견디고 zodiacCode를 보정해요) */
function parseTranslation(text: string): Map<string, TranslatedItem> | null {
	const stripped = text.replace(/```(?:json)?/gi, '').trim();
	const start = stripped.indexOf('[');
	const end = stripped.lastIndexOf(']');
	if (start === -1 || end <= start) return null;
	try {
		const arr: unknown = JSON.parse(stripped.slice(start, end + 1));
		if (!Array.isArray(arr)) return null;
		const map = new Map<string, TranslatedItem>();
		for (const entry of arr) {
			if (!entry || typeof entry !== 'object') continue;
			const e = entry as { zodiacCode?: unknown; content?: unknown; lucky?: unknown };
			if (typeof e.zodiacCode !== 'string') continue;
			const code = /^\d$/.test(e.zodiacCode) ? e.zodiacCode.padStart(2, '0') : e.zodiacCode;
			map.set(code, { zodiacCode: code, content: String(e.content ?? ''), lucky: String(e.lucky ?? '') });
		}
		return map.size > 0 ? map : null;
	} catch {
		return null;
	}
}

/** 일본어 원문을 LLM으로 한글 번역해요. 한 건이라도 성공하면 translated: true */
async function translateDaily(raw: DailyHoroscope, config: ChatConfig): Promise<DailyHoroscope> {
	const items: TranslatedItem[] = raw.horoscopes
		.filter((h) => h.content || h.lucky)
		.map((h) => ({ zodiacCode: h.zodiacCode, content: h.content, lucky: h.lucky }));
	if (items.length === 0) return raw;

	const result = await streamChatCompletion({
		messages: [
			{ role: 'system', content: TRANSLATE_SYSTEM_PROMPT },
			{ role: 'user', content: JSON.stringify(items) }
		],
		config: { ...config, timeoutMs: Math.min(config.timeoutMs, 60_000) }
	});
	const map = parseTranslation(result.content);
	if (!map) throw new Error('translation output is not valid JSON');

	let translatedCount = 0;
	const horoscopes = raw.horoscopes.map((h) => {
		const t = map.get(h.zodiacCode);
		if (!t) return h;
		translatedCount++;
		return { ...h, content: t.content || h.content, lucky: t.lucky || h.lucky };
	});
	if (translatedCount === 0) throw new Error('no items translated');
	return { ...raw, horoscopes, translated: true };
}

/**
 * 오늘의 오하아사 — AI 한글 번역본을 날짜 단위로 캐싱해요.
 * 캐시 순서: 프로세스 메모리 → Redis → LLM 번역. 번역 설정이 없거나 실패 시 일본어 원문 그대로.
 */
export async function fetchOhaasaKo(): Promise<DailyHoroscope> {
	const raw = await fetchOhaasa();
	if (cachedKo?.date === raw.date) return cachedKo.daily;

	const store = container.redisStore;
	const key = cacheKey(raw.date);

	const cached = (await store?.getCacheValue(key)) ?? null;
	if (cached) {
		const hit = parseCached(cached);
		if (hit) {
			cachedKo = { date: raw.date, daily: hit };
			return hit;
		}
	}

	const config = getChatConfig();
	if (!config) {
		// 번역 설정이 없으면 원문으로 확정 (같은 날 무한 재시도하지 않도록)
		cachedKo = { date: raw.date, daily: raw };
		return raw;
	}
	if (failedAt && Date.now() - failedAt < RETRY_AFTER_MS) return raw;

	// 다른 셰드/프로세스가 같은 날짜를 번역 중이면 잠시 기다려요
	const acquired = (await store?.setCacheValueNX(lockKey(raw.date), '1', LOCK_TTL_SECONDS)) ?? true;
	if (!acquired) {
		for (let i = 0; i < LOCK_POLL_TRIES; i++) {
			await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
			const waited = (await store?.getCacheValue(key)) ?? null;
			if (waited) {
				const hit = parseCached(waited);
				if (hit) {
					cachedKo = { date: raw.date, daily: hit };
					return hit;
				}
			}
		}
	}

	try {
		const daily = await translateDaily(raw, config);
		cachedKo = { date: raw.date, daily };
		await store?.setCacheValue(key, JSON.stringify(daily), REDIS_TTL_SECONDS);
		failedAt = 0;
		return daily;
	} catch (error) {
		failedAt = Date.now();
		container.logger.warn('[ohaasa] korean translation failed:', error);
		return raw;
	}
}

// ── 일일 프리패치 ───────────────────────────────────────────────────────────
let prefetchScheduled = false;

/** 매일 KST 06:50(+지터)에 한국어 번역본을 미리 만들어둬요. ready에서 셰드 0이 1회 호출. */
export function startOhaasaPrefetchSchedule(): void {
	if (prefetchScheduled) return;
	prefetchScheduled = true;
	scheduleNextPrefetch();
}

function scheduleNextPrefetch(): void {
	const delay = msUntilNextPrefetch();
	setTimeout(() => {
		void runPrefetch().finally(scheduleNextPrefetch);
	}, delay).unref?.();
}

/** 다음 KST 06:50(+0~20분 지터)까지 남은 ms */
function msUntilNextPrefetch(): number {
	const KST_OFFSET_MS = 9 * 3600_000;
	const now = Date.now();
	const seoul = new Date(now + KST_OFFSET_MS);
	const jitter = Math.floor(Math.random() * PREFETCH_JITTER_MAX_MS);
	const target =
		Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth(), seoul.getUTCDate(), PREFETCH_HOUR_KST, PREFETCH_MINUTE_KST) - KST_OFFSET_MS + jitter;
	return Math.max(60_000, (target > now ? target : target + 24 * 3600_000) - now);
}

async function runPrefetch(): Promise<void> {
	try {
		if (!getChatConfig()) return;
		const daily = await fetchOhaasaKo();
		container.logger.info(`[ohaasa] daily prefetch done: ${daily.date} (source=${daily.source}, translated=${daily.translated})`);
	} catch (error) {
		container.logger.warn('[ohaasa] daily prefetch failed:', error);
	}
}
