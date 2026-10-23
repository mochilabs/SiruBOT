import { Prisma, type PrismaClient } from '@sirubot/prisma';
import {
	MEMORY_CATEGORIES,
	countMarkdownEntries,
	createEmptyMemorySections,
	hasMemoryEntries,
	parseMemoryMarkdown,
	renderMemoryMarkdown,
	type MemoryCategory,
	type MemorySections
} from '@sirubot/utils';
import { getLogger } from '../utils/logger.ts';
import { parseClock } from '../utils/parseClock.ts';
import type { TranslationProvider } from '../providers/translate.ts';

const logger = getLogger('memory-tidy');

const TIDY_USER_DELAY_MS = 1500;
const LONG_TERM_MAX = 40;
const MEMORY_TIDY_PROMPT = [
	'당신은 장기 기억 파일(MEMORY.md)을 관리하는 정리 담당이에요. 입력된 파일을 검토해 정리한 파일 전체를 출력해요.',
	'할 일:',
	'- 내용이 같은 항목은 하나로 병합해요 (날짜 표기는 유지하거나 더 최신으로 바꿔요).',
	'- 섹션 배정이 어긋난 항목만 옮겨요: 사실은 Facts, 선호는 Preferences, 약속·미결은 Commitments.',
	'- 명백히 지난 시점 정보의 표기는 고칠 수 있지만, 원문에 없는 새 사실을 지어내지 않아요.',
	'규칙:',
	'- 형식 유지: "# MEMORY.md" 제목 + 안내 주석 + "## Facts" / "## Preferences" / "## Commitments" 헤더 (섹션이 비어도 헤더 유지)',
	'- 항목은 한 줄 불릿("- ...")으로, 총 40개 이하',
	'- 불릿 외 다른 텍스트·설명·코드 펜스를 붙이지 않고 파일 본문만 출력해요.'
].join('\n');

interface MemoryTidyStats {
	lastRunAt: number | null;
	lastRunUsers: number;
	lastRunOk: number;
	lastRunRejected: number;
	lastRunFailed: number;
	running: boolean;
	nextRunAt: number | null;
}

const stats: MemoryTidyStats = {
	lastRunAt: null,
	lastRunUsers: 0,
	lastRunOk: 0,
	lastRunRejected: 0,
	lastRunFailed: 0,
	running: false,
	nextRunAt: null
};

export function memoryTidyStatus(): MemoryTidyStats {
	return { ...stats };
}

function stripCodeFences(text: string): string {
	const lines = text.split('\n');
	while (lines.length > 0 && /^```/.test(lines[0]!.trim())) lines.shift();
	while (lines.length > 0 && /^```/.test(lines[lines.length - 1]!.trim())) lines.pop();
	return lines.join('\n').trim();
}

function tidyOutputValid(original: string, output: string): boolean {
	if (!output.includes('# MEMORY.md')) return false;
	if (!output.includes('## Facts') || !output.includes('## Preferences') || !output.includes('## Commitments')) return false;
	const before = countMarkdownEntries(original);
	const after = countMarkdownEntries(output);
	if (before > 0 && after < Math.ceil(before * 0.4)) return false;
	return after > 0 || before === 0;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 섹션별 상한 — 최근 항목 우선으로 뒤에서 자라요 (data-api tidy 정책; 봇은 총량 상한) */
function capMemorySections(sections: MemorySections): void {
	for (const category of MEMORY_CATEGORIES) {
		const list = sections[category];
		if (list.length > LONG_TERM_MAX) sections[category] = list.slice(list.length - LONG_TERM_MAX);
	}
}

/** 옛 배열 형태({ text, category? })를 마크다운으로 변환해요 (레거시 호환: category 보존 — 봇 변환과 계약이 달라요) */
function legacyToMarkdown(items: unknown[]): string {
	const sections = createEmptyMemorySections();
	for (const item of items) {
		if (!item || typeof item !== 'object') continue;
		const f = item as { text?: unknown; category?: unknown };
		if (typeof f.text !== 'string' || !f.text) continue;
		const category =
			typeof f.category === 'string' && MEMORY_CATEGORIES.includes(f.category as MemoryCategory) ? (f.category as MemoryCategory) : 'facts';
		sections[category].push(f.text.trim());
	}
	return renderMemoryMarkdown(sections);
}

/** 저장된 장기 기억을 파일 형식(마크다운)으로 정규화해요. */
function normalizeStored(stored: unknown): string | null {
	if (typeof stored === 'string') {
		if (stored.includes('## Facts') || stored.includes('# MEMORY.md')) return stored;
		try {
			const parsed: unknown = JSON.parse(stored);
			if (Array.isArray(parsed)) return legacyToMarkdown(parsed);
		} catch {
			// 마크다운으로 간주
		}
		return stored;
	}
	if (Array.isArray(stored)) return legacyToMarkdown(stored);
	return null;
}

/** 한 사용자의 MEMORY.md를 LLM으로 정리해요. 검증 실패 시 원본을 유지해요. */
async function tidyUser(db: PrismaClient, provider: TranslationProvider, userId: string): Promise<'ok' | 'rejected' | 'failed'> {
	try {
		const row = await db.userMemory.findUnique({ where: { userId } });
		const original = normalizeStored(row?.longTerm);
		if (!original || !hasMemoryEntries(parseMemoryMarkdown(original))) {
			await db.userMemory.upsert({
				where: { userId },
				create: { userId, tidiedAt: new Date() },
				update: { tidiedAt: new Date() }
			});
			return 'ok';
		}

		// 번역 프로바이더와 같은 OpenAI 호환 호출 경로(chatCompletion)를 재사용해요
		const output = stripCodeFences(await provider.chatCompletion(MEMORY_TIDY_PROMPT, original, 'tidy provider'));

		if (tidyOutputValid(original, output)) {
			const sections = parseMemoryMarkdown(output);
			capMemorySections(sections);
			await db.userMemory.upsert({
				where: { userId },
				create: { userId, longTerm: renderMemoryMarkdown(sections), tidiedAt: new Date() },
				update: { longTerm: renderMemoryMarkdown(sections), tidiedAt: new Date() }
			});
			return 'ok';
		}
		logger.warn(`tidy output rejected, keeping original: ${userId}`);
		await db.userMemory.upsert({ where: { userId }, create: { userId, tidiedAt: new Date() }, update: { tidiedAt: new Date() } });
		return 'rejected';
	} catch (error) {
		logger.error(`memory tidy failed: ${userId}`, String(error));
		// 실패해도 markTidied — 같은 사용자가 매 밤 재시도되지 않도록 (24시간 후 다시 후보)
		await db.userMemory
			.upsert({ where: { userId }, create: { userId, tidiedAt: new Date() }, update: { tidiedAt: new Date() } })
			.catch(() => undefined);
		return 'failed';
	}
}

/** nightly pass 후보 스캔 상한 — 페이지를 넘겨가며 찾되 배치의 배수(10배) 행까지만 봐요 (공백 longTerm 행이 섞여도 한 밤에 크게 밀리지 않게) */
const CANDIDATE_SCAN_FACTOR = 10;

/** nightly pass 후보 — 24시간 이상 정리 안 됐고 장기 기억이 있는 사용자. never-tidied 우선, tidiedAt 오래된 순. */
async function findCandidates(db: PrismaClient, limit: number): Promise<string[]> {
	const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const scanCap = limit * CANDIDATE_SCAN_FACTOR;
	const candidates: { userId: string }[] = [];
	let scanned = 0;
	while (candidates.length < limit && scanned < scanCap) {
		const take = Math.min(limit * 3, scanCap - scanned);
		// 빈 longTerm(SQL NULL) 행은 쿼리에서 먼저 걸러 후보 창을 낭비하지 않아요.
		const rows = await db.userMemory.findMany({
			where: {
				AND: [{ longTerm: { not: Prisma.DbNull } }, { OR: [{ tidiedAt: null }, { tidiedAt: { lt: cutoff } }] }]
			},
			// never-tidied를 앞에 두고 오래된 순 — DB가 보장하는 순서라 메모리 정렬 없이 페이지네이션이 안전해요.
			orderBy: [{ tidiedAt: { sort: 'asc', nulls: 'first' } }, { userId: 'asc' }],
			skip: scanned,
			take
		});
		if (rows.length === 0) break;
		scanned += rows.length;
		for (const row of rows) {
			const normalized = normalizeStored(row.longTerm);
			if (!normalized) continue;
			if (countMarkdownEntries(normalized) > 0) candidates.push({ userId: row.userId });
			if (candidates.length >= limit) break;
		}
		if (rows.length < take) break; // 페이지가 가득 안 채워졌다는 건 더 이상 행이 없어요
	}
	return candidates.map((c) => c.userId);
}

async function runMemoryTidy(db: PrismaClient, provider: TranslationProvider, batchSize: number): Promise<MemoryTidyStats> {
	if (stats.running) return memoryTidyStatus();
	stats.running = true;
	stats.lastRunAt = Date.now();
	stats.lastRunUsers = 0;
	stats.lastRunOk = 0;
	stats.lastRunRejected = 0;
	stats.lastRunFailed = 0;
	try {
		const candidates = await findCandidates(db, batchSize);
		stats.lastRunUsers = candidates.length;
		if (candidates.length > 0) logger.info(`memory tidy pass started (${candidates.length} users)`);
		for (const userId of candidates) {
			const result = await tidyUser(db, provider, userId);
			if (result === 'ok') stats.lastRunOk++;
			else if (result === 'rejected') stats.lastRunRejected++;
			else stats.lastRunFailed++;
			await sleep(TIDY_USER_DELAY_MS);
		}
		if (candidates.length > 0) logger.info('memory tidy pass finished');
	} catch (error) {
		logger.error('memory tidy batch failed:', String(error));
	} finally {
		stats.running = false;
	}
	return memoryTidyStatus();
}

function msUntilNext(at: string, jitterMaxMs = 30 * 60_000): number {
	// 서버 로컬 시각 기준이에요 — ohaasaScheduler.msUntilNextRefresh는 KST 보정 UTC 대상이라 병합하면 안 돼요.
	const now = Date.now();
	const { hour, minute } = parseClock(at, { hour: 0, minute: 0 });
	const next = new Date(now);
	next.setHours(hour, minute, 0, 0);
	const jitter = Math.floor(Math.random() * jitterMaxMs);
	const target = (next.getTime() > now ? next.getTime() : next.getTime() + 24 * 3600_000) + jitter;
	return Math.max(60_000, target - now);
}

/** 매일 자정(+0~30분 지터)에 기억 정리 배치. DATABASE_URL·프로바이더가 있을 때만 시작해요. */
export function startMemoryTidyScheduler(
	db: PrismaClient | null,
	provider: TranslationProvider,
	options: { enabled: boolean; at: string; batchSize: number }
): () => void {
	let stopped = false;
	let timer: NodeJS.Timeout | null = null;

	if (!db || !provider.available || !options.enabled) {
		logger.warn(`memory tidy disabled (db: ${Boolean(db)}, provider: ${provider.available}, enabled: ${options.enabled})`);
		return () => {
			stopped = true;
		};
	}

	const tick = () => {
		if (stopped) return;
		// 지터는 한 번만 뽑아요 — 예약된 타이머와 표시값(stats.nextRunAt)이 같은 시각을 가리키게.
		const delayMs = msUntilNext(options.at);
		stats.nextRunAt = Date.now() + delayMs;
		timer = setTimeout(() => {
			if (stopped) return;
			void runMemoryTidy(db, provider, options.batchSize).finally(tick);
		}, delayMs);
		timer.unref?.();
	};

	tick();
	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
	};
}
