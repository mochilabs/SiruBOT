import type { PrismaClient } from '@sirubot/prisma';
import { getLogger } from '../utils/logger.ts';
import type { OpenAICompatTranslationProvider } from '../providers/translate.ts';
import {
	capMemorySections,
	countMarkdownEntries,
	hasMemoryEntries,
	legacyToMarkdown,
	parseMemoryMarkdown,
	renderMemoryMarkdown
} from './memoryFile.ts';

const logger = getLogger('memory-tidy');

const TIDY_USER_DELAY_MS = 1500;
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
async function tidyUser(db: PrismaClient, provider: OpenAICompatTranslationProvider, userId: string): Promise<'ok' | 'rejected' | 'failed'> {
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

		// 번역 프로바이더와 동일한 OpenAI 호환 호출 경로를 재사용해요
		const res = await fetch(`${provider.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {})
			},
			body: JSON.stringify({
				model: provider.model,
				messages: [
					{ role: 'system', content: MEMORY_TIDY_PROMPT },
					{ role: 'user', content: original }
				],
				stream: false
			}),
			signal: AbortSignal.timeout(60_000)
		});
		if (!res.ok) throw new Error(`tidy provider failed: ${res.status}`);
		const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
		const output = stripCodeFences(body.choices?.[0]?.message?.content ?? '');

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

/** nightly pass 후보 — 24시간 이상 정리 안 됐고 장기 기억이 있는 사용자. never-tidied 우선. */
async function findCandidates(db: PrismaClient, limit: number): Promise<string[]> {
	const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const rows = await db.userMemory.findMany({
		where: { OR: [{ tidiedAt: null }, { tidiedAt: { lt: cutoff } }] },
		take: limit * 3
	});
	const candidates: { userId: string; tidiedAt: Date | null; entries: number }[] = [];
	for (const row of rows) {
		const normalized = normalizeStored(row.longTerm);
		if (!normalized) continue;
		const entries = countMarkdownEntries(normalized);
		if (entries > 0) candidates.push({ userId: row.userId, tidiedAt: row.tidiedAt, entries });
	}
	candidates.sort((a, b) => {
		if (a.tidiedAt === null && b.tidiedAt === null) return 0;
		if (a.tidiedAt === null) return -1;
		if (b.tidiedAt === null) return 1;
		return a.tidiedAt.getTime() - b.tidiedAt.getTime();
	});
	return candidates.slice(0, limit).map((c) => c.userId);
}

async function runMemoryTidy(db: PrismaClient, provider: OpenAICompatTranslationProvider, batchSize: number): Promise<MemoryTidyStats> {
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

function parseAt(value: string): { hour: number; minute: number } {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	const hour = match ? Number(match[1]) : 0;
	const minute = match ? Number(match[2]) : 0;
	return { hour: Math.min(23, Math.max(0, hour)), minute: Math.min(59, Math.max(0, minute)) };
}

function msUntilNext(at: string, jitterMaxMs = 30 * 60_000): number {
	const now = Date.now();
	const { hour, minute } = parseAt(at);
	const next = new Date(now);
	next.setHours(hour, minute, 0, 0);
	const jitter = Math.floor(Math.random() * jitterMaxMs);
	const target = (next.getTime() > now ? next.getTime() : next.getTime() + 24 * 3600_000) + jitter;
	return Math.max(60_000, target - now);
}

/** 매일 자정(+0~30분 지터)에 기억 정리 배치. DATABASE_URL·프로바이더가 있을 때만 시작해요. */
export function startMemoryTidyScheduler(
	db: PrismaClient | null,
	provider: OpenAICompatTranslationProvider,
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
		timer = setTimeout(() => {
			if (stopped) return;
			stats.nextRunAt = Date.now() + msUntilNext(options.at);
			void runMemoryTidy(db, provider, options.batchSize).finally(tick);
		}, msUntilNext(options.at));
		timer.unref?.();
		stats.nextRunAt = Date.now() + msUntilNext(options.at);
	};

	tick();
	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
	};
}
