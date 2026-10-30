import { container } from '@sapphire/framework';
import {
	MEMORY_CATEGORIES,
	createEmptyMemorySections,
	hasMemoryEntries,
	parseMemoryMarkdown,
	renderMemoryMarkdown,
	type MemoryCategory,
	type MemorySections
} from '@sirubot/utils';

/** 단기 기억 항목 — 최근 대화 하이라이트 */
export type MemoryTurn = {
	q: string;
	a: string;
	at: number;
	channelId: string;
};

const LONG_TERM_MAX = 40;
const SHORT_TERM_MAX = 8;
const FACT_MAX_CHARS = 300;
const PROMPT_TURN_CHARS = 160;

/** 읽을 때 앞에 붙는 안내 — 파일 본문에는 없는 주석이에요 (프롬프트에서만 제공) */
const MEMORY_FILE_ABOUT =
	'> **이 파일에 대해.** 이것은 시루의 장기 기억 파일(MEMORY.md)이에요. 대화에서 얻은 오래가는 사실·선호·약속을 모아요. ' +
	'시루는 대화를 시작할 때 읽고, 오래되면 정리해요. 시루의 이해를 반영한 것이므로 최신이 아닐 수 있어요. ' +
	'직접 편집하거나 잊으라고 말할 수 있어요. **이 안내는 파일에 없는 주석이에요.**';

function clip(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

function dateLabel(at: number): string {
	const d = new Date(at);
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${d.getFullYear()}-${month}-${day}`;
}

/** 총 항목 수 상한 — 넘치면 오래된 것부터 Facts → Preferences → Commitments 순으로 잘라요 (봇 정책; data-api는 섹션별 상한) */
function capMemorySections(sections: MemorySections): void {
	let total = MEMORY_CATEGORIES.reduce((sum, category) => sum + sections[category].length, 0);
	if (total <= LONG_TERM_MAX) return;
	for (const category of MEMORY_CATEGORIES) {
		while (sections[category].length > 0 && total > LONG_TERM_MAX) {
			sections[category].shift();
			total--;
		}
		if (total <= LONG_TERM_MAX) break;
	}
}

/** 옛 구조({ id, text, at } 배열)를 Facts 섹션 마크다운으로 변환해요 (봇 변환: 날짜 꼬리표·300자 클립 — data-api 변환과 계약이 달라요) */
function legacyToMarkdown(facts: unknown[]): string {
	const sections = createEmptyMemorySections();
	for (const fact of facts) {
		if (!fact || typeof fact !== 'object') continue;
		const f = fact as { text?: unknown; at?: unknown };
		if (typeof f.text !== 'string' || !f.text.trim()) continue;
		const at = typeof f.at === 'number' ? f.at : Date.now();
		sections.facts.push(`${clip(f.text.trim(), FACT_MAX_CHARS)} (${dateLabel(at)} 확인)`);
	}
	capMemorySections(sections);
	return renderMemoryMarkdown(sections);
}

/**
 * 사용자별 장기·단기 기억을 관리해요.
 * 장기 기억은 Muse식 MEMORY.md 파일(마크다운)으로 저장하고, 단기 기억은 매 턴 자동으로 쌓여요.
 * 옛 구조로 저장된 데이터는 읽을 때 자동으로 파일 형식으로 변환돼요.
 */
export class AiMemoryService {
	/** 장기 기억 파일(MEMORY.md) 마크다운을 불러와요. 아직 없으면 빈 파일 형태 */
	public async readFile(userId: string): Promise<string> {
		const row = await container.db.userMemory.findUnique({ where: { userId }, select: { longTerm: true } });
		return this.storedFileToMarkdown(row?.longTerm);
	}

	private storedFileToMarkdown(stored: unknown): string {
		if (typeof stored === 'string') {
			// 이미 파일 형식이면 그대로, 옛 array 문자열이면 변환 시도
			if (stored.includes('## Facts') || stored.includes('# MEMORY.md')) return stored;
			try {
				const parsed: unknown = JSON.parse(stored);
				if (Array.isArray(parsed)) return legacyToMarkdown(parsed);
			} catch {
				// 파싱 실패 시 마크다운으로 간주
			}
			return stored;
		}
		if (Array.isArray(stored)) return legacyToMarkdown(stored);
		return renderMemoryMarkdown(createEmptyMemorySections());
	}

	public async writeFile(userId: string, markdown: string): Promise<void> {
		await container.db.userMemory.upsert({
			where: { userId },
			create: { userId, longTerm: markdown, shortTerm: [] },
			update: { longTerm: markdown }
		});
	}

	/** MEMORY.md의 특정 섹션에 항목 하나를 추가해요. 같은 문구는 중복 저장하지 않아요. */
	public async saveFact(userId: string, category: MemoryCategory, text: string): Promise<{ added: boolean; total: number }> {
		const trimmed = clip(text.trim().replace(/\s+/g, ' '), FACT_MAX_CHARS);
		if (!trimmed) throw new Error('저장할 내용이 없어요.');
		if (!MEMORY_CATEGORIES.includes(category)) throw new Error('알 수 없는 기억 섹션이에요.');

		const sections = parseMemoryMarkdown(await this.readFile(userId), { strictSections: false });
		const duplicated = MEMORY_CATEGORIES.some((c) => sections[c].some((entry) => entry.toLowerCase() === trimmed.toLowerCase()));
		if (duplicated) {
			return { added: false, total: MEMORY_CATEGORIES.reduce((sum, c) => sum + sections[c].length, 0) };
		}

		sections[category].push(trimmed);
		capMemorySections(sections);
		await this.writeFile(userId, renderMemoryMarkdown(sections));
		return { added: true, total: MEMORY_CATEGORIES.reduce((sum, c) => sum + sections[c].length, 0) };
	}

	/** 항목 텍스트 일부로 MEMORY.md에서 기억을 지워요. 일치하는 항목 모두 제거. */
	public async forgetFact(userId: string, match: string): Promise<string[]> {
		const needle = match.trim().toLowerCase();
		if (!needle) throw new Error('지울 기억의 텍스트가 필요해요.');

		const sections = parseMemoryMarkdown(await this.readFile(userId), { strictSections: false });
		const removed: string[] = [];
		for (const category of MEMORY_CATEGORIES) {
			const kept: string[] = [];
			for (const entry of sections[category]) {
				if (entry.toLowerCase().includes(needle)) removed.push(entry);
				else kept.push(entry);
			}
			sections[category] = kept;
		}
		if (removed.length === 0) return [];
		await this.writeFile(userId, renderMemoryMarkdown(sections));
		return removed;
	}

	/** 한 턴의 대화를 단기 기억에 밀어 넣어요 (최근 8개 유지). */ public async pushTurn(
		userId: string,
		channelId: string,
		q: string,
		a: string
	): Promise<void> {
		const row = await container.db.userMemory.findUnique({ where: { userId } });
		const shortTerm = Array.isArray(row?.shortTerm) ? (row.shortTerm as MemoryTurn[]).filter((t) => t && typeof t.q === 'string') : [];
		const turn: MemoryTurn = { q: clip(q, PROMPT_TURN_CHARS), a: clip(a, PROMPT_TURN_CHARS), at: Date.now(), channelId };
		await container.db.userMemory.upsert({
			where: { userId },
			create: { userId, shortTerm: [...shortTerm, turn].slice(-SHORT_TERM_MAX) },
			update: { shortTerm: [...shortTerm, turn].slice(-SHORT_TERM_MAX) }
		});
	}

	/** 단기 기억(최근 대화) 턴 목록을 읽어요 — 장기 기억 승격(promotion)의 원재료. */
	public async getShortTermTurns(userId: string): Promise<MemoryTurn[]> {
		const row = await container.db.userMemory.findUnique({ where: { userId }, select: { shortTerm: true } });
		return Array.isArray(row?.shortTerm) ? (row.shortTerm as MemoryTurn[]).filter((t) => t && typeof t.q === 'string') : [];
	}

	/** 추출된 장기 기억 항목들을 MEMORY.md에 병합해요. 중복은 무시하고, 이미 저장된 항목과 겹치지 않는 것만 추가해요. */
	public async mergeLongTerm(userId: string, entries: { category: MemoryCategory; text: string }[]): Promise<number> {
		const sections = parseMemoryMarkdown(await this.readFile(userId), { strictSections: false });
		let added = 0;
		for (const entry of entries) {
			const trimmed = clip(entry.text.trim().replace(/\s+/g, ' '), FACT_MAX_CHARS);
			if (!trimmed) continue;
			if (!MEMORY_CATEGORIES.includes(entry.category)) continue;
			const duplicated = MEMORY_CATEGORIES.some((c) => sections[c].some((existing) => existing.toLowerCase() === trimmed.toLowerCase()));
			if (duplicated) continue;
			sections[entry.category].push(trimmed);
			added++;
		}
		if (added === 0) return 0;
		capMemorySections(sections);
		await this.writeFile(userId, renderMemoryMarkdown(sections));
		return added;
	}

	/** 압축된 단기 기억 요약을 읽어요. 없으면 null. */
	public async getShortTermSummary(userId: string): Promise<string | null> {
		const row = await container.db.userMemory.findUnique({ where: { userId }, select: { shortTermSummary: true } });
		const summary = row?.shortTermSummary?.trim();
		return summary ? summary : null;
	}

	/** 승격/압축 후 단기 기억 원본 턴을 비우고, 압축 요약을 새 것으로 교체해요. */
	public async compactShortTerm(userId: string, summary: string): Promise<void> {
		const trimmed = summary.trim();
		await container.db.userMemory.upsert({
			where: { userId },
			create: { userId, shortTerm: [], shortTermSummary: trimmed },
			update: { shortTerm: [], shortTermSummary: trimmed }
		});
	}

	/** 압축할 게 없을 때 단기 기억 원본만 비워요 (요약은 유지). */
	public async clearShortTerm(userId: string): Promise<void> {
		await container.db.userMemory.upsert({
			where: { userId },
			create: { userId, shortTerm: [] },
			update: { shortTerm: [] }
		});
	}

	/** 시스템 프롬프트에 넣을 기억 블록 — MEMORY.md 파일 + 압축 요약 + 단기 기억. 셋 다 없으면 null. */
	public async buildPromptBlock(userId: string): Promise<string | null> {
		const row = await container.db.userMemory.findUnique({
			where: { userId },
			select: { longTerm: true, shortTerm: true, shortTermSummary: true }
		});
		const file = this.storedFileToMarkdown(row?.longTerm);
		const sections = parseMemoryMarkdown(file, { strictSections: false });
		const shortTerm = Array.isArray(row?.shortTerm) ? (row.shortTerm as MemoryTurn[]).filter((t) => t && typeof t.q === 'string') : [];
		const summary = row?.shortTermSummary?.trim() || null;

		if (!hasMemoryEntries(sections) && shortTerm.length === 0 && !summary) return null;

		const lines: string[] = [
			'# 사용자 기억 (MEMORY.md)',
			'',
			MEMORY_FILE_ABOUT,
			'',
			'방금 말한 사용자의 기억이에요. 다른 사용자의 기억을 섞지 마세요.',
			'',
			file
		];
		if (summary) {
			lines.push('', '## 최근 대화 요약 (압축)', summary);
		}
		if (shortTerm.length > 0) {
			lines.push('', '## 단기 기억 (최근 대화)', ...shortTerm.map((turn) => `- 사용자: ${turn.q}\n  시루: ${turn.a}`));
		}
		return lines.join('\n');
	}
}
