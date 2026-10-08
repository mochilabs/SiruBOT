import { container } from '@sapphire/framework';

/** 장기 기억 파일의 섹션 — 사실/선호/약속 */
export type MemoryCategory = 'facts' | 'preferences' | 'commitments';

export const CATEGORIES: MemoryCategory[] = ['facts', 'preferences', 'commitments'];
const SECTION_TITLES: Record<MemoryCategory, string> = {
	facts: 'Facts',
	preferences: 'Preferences',
	commitments: 'Commitments'
};

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

/** 파일 안에 들어가는 인트로 주석 (MEMORY.md 본문의 일부) */
const MEMORY_FILE_INTRO = '<!-- 시루가 모아둔 장기 기억: 오래가는 사실·선호·약속만. 일상 잡담은 남기지 않아요. -->';

/** 읽을 때 앞에 붙는 안내 — 파일 본문에는 없는 주석이에요 (프롬프트에서만 제공) */
export const MEMORY_FILE_ABOUT =
	'> **이 파일에 대해.** 이것은 시루의 장기 기억 파일(MEMORY.md)이에요. 대화에서 얻은 오래가는 사실·선호·약속을 모아요. ' +
	'시루는 대화를 시작할 때 읽고, 오래되면 정리해요. 시루의 이해를 반영한 것이므로 최신이 아닐 수 있어요. ' +
	'직접 편집하거나 잊으라고 말할 수 있어요. **이 안내는 파일에 없는 주석이에요.**';

type MemorySections = Record<MemoryCategory, string[]>;

function emptySections(): MemorySections {
	return { facts: [], preferences: [], commitments: [] };
}

function clip(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

function dateLabel(at: number): string {
	const d = new Date(at);
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${d.getFullYear()}-${month}-${day}`;
}

/** 빈 섹션 헤더도 유지한 채 파일 마크다운을 만들어요 */
export function renderMemoryMarkdown(sections: MemorySections): string {
	const lines = ['# MEMORY.md', '', MEMORY_FILE_INTRO];
	for (const category of CATEGORIES) {
		lines.push('', `## ${SECTION_TITLES[category]}`);
		if (sections[category].length > 0) lines.push(...sections[category].map((entry) => `- ${entry}`));
	}
	return lines.join('\n');
}

/** 파일 마크다운을 섹션별 항목 목록으로 파싱해요 */
export function parseMemoryMarkdown(markdown: string): MemorySections {
	const sections = emptySections();
	// 섹션 헤더 전의 불릿은 Facts로 보내요
	let current: MemoryCategory = 'facts';
	for (const rawLine of markdown.split('\n')) {
		const line = rawLine.trim();
		const heading = line.match(/^##\s+(Facts|Preferences|Commitments)\s*$/i);
		if (heading) {
			current = heading[1]!.toLowerCase() as MemoryCategory;
			continue;
		}
		if (line.startsWith('- ')) sections[current].push(line.slice(2).trim());
	}
	return sections;
}

export function hasMemoryEntries(sections: MemorySections): boolean {
	return CATEGORIES.some((category) => sections[category].length > 0);
}

/** 총 항목 수 상한 — 넘치면 오래된 것부터 Facts → Preferences → Commitments 순으로 잘라요 */
export function capMemorySections(sections: MemorySections): void {
	let total = CATEGORIES.reduce((sum, category) => sum + sections[category].length, 0);
	if (total <= LONG_TERM_MAX) return;
	for (const category of CATEGORIES) {
		while (sections[category].length > 0 && total > LONG_TERM_MAX) {
			sections[category].shift();
			total--;
		}
		if (total <= LONG_TERM_MAX) break;
	}
}

/** 옛 구조({ id, text, at } 배열)를 Facts 섹션 마크다운으로 변환해요 */
function legacyToMarkdown(facts: unknown[]): string {
	const sections = emptySections();
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
		return renderMemoryMarkdown(emptySections());
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
		if (!CATEGORIES.includes(category)) throw new Error('알 수 없는 기억 섹션이에요.');

		const sections = parseMemoryMarkdown(await this.readFile(userId));
		const duplicated = CATEGORIES.some((c) => sections[c].some((entry) => entry.toLowerCase() === trimmed.toLowerCase()));
		if (duplicated) {
			return { added: false, total: CATEGORIES.reduce((sum, c) => sum + sections[c].length, 0) };
		}

		sections[category].push(trimmed);
		capMemorySections(sections);
		await this.writeFile(userId, renderMemoryMarkdown(sections));
		return { added: true, total: CATEGORIES.reduce((sum, c) => sum + sections[c].length, 0) };
	}

	/** 항목 텍스트 일부로 MEMORY.md에서 기억을 지워요. 일치하는 항목 모두 제거. */
	public async forgetFact(userId: string, match: string): Promise<string[]> {
		const needle = match.trim().toLowerCase();
		if (!needle) throw new Error('지울 기억의 텍스트가 필요해요.');

		const sections = parseMemoryMarkdown(await this.readFile(userId));
		const removed: string[] = [];
		for (const category of CATEGORIES) {
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

	/**
	 * nightly pass 후보 — 24시간 이상 정리 안 됐고 장기 기억이 있는 사용자.
	 * never-tidied(null)를 먼저 정렬해요.
	 */
	public async findTidyCandidates(limit: number): Promise<{ userId: string }[]> {
		const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const rows = await container.db.userMemory.findMany({
			where: { OR: [{ tidiedAt: null }, { tidiedAt: { lt: cutoff } }] },
			take: limit * 3
		});
		const candidates: { userId: string; tidiedAt: Date | null; entries: number }[] = [];
		for (const row of rows) {
			const entries = this.countStoredEntries(row.longTerm);
			if (entries > 0) candidates.push({ userId: row.userId, tidiedAt: row.tidiedAt, entries });
		}
		candidates.sort((a, b) => {
			if (a.tidiedAt === null && b.tidiedAt === null) return 0;
			if (a.tidiedAt === null) return -1;
			if (b.tidiedAt === null) return 1;
			return a.tidiedAt.getTime() - b.tidiedAt.getTime();
		});
		return candidates.slice(0, limit);
	}

	/** 저장된 장기 기억의 항목 수를 형태(파일/옛 배열) 상관없이 세어요 */
	private countStoredEntries(stored: unknown): number {
		if (typeof stored === 'string') {
			const sections = parseMemoryMarkdown(stored);
			return CATEGORIES.reduce((sum, c) => sum + sections[c].length, 0);
		}
		if (Array.isArray(stored)) return stored.filter((f) => f && typeof (f as { text?: unknown }).text === 'string').length;
		return 0;
	}

	/** nightly pass가 이 사용자를 처리했다는 표시 (실패해도 표시해 다음 배치로 넘겨요) */
	public async markTidied(userId: string): Promise<void> {
		await container.db.userMemory.upsert({
			where: { userId },
			create: { userId, tidiedAt: new Date() },
			update: { tidiedAt: new Date() }
		});
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

	/** 시스템 프롬프트에 넣을 기억 블록 — MEMORY.md 파일 + 단기 기억. 둘 다 없으면 null. */
	public async buildPromptBlock(userId: string): Promise<string | null> {
		const row = await container.db.userMemory.findUnique({ where: { userId }, select: { longTerm: true, shortTerm: true } });
		const file = this.storedFileToMarkdown(row?.longTerm);
		const sections = parseMemoryMarkdown(file);
		const shortTerm = Array.isArray(row?.shortTerm) ? (row.shortTerm as MemoryTurn[]).filter((t) => t && typeof t.q === 'string') : [];

		if (!hasMemoryEntries(sections) && shortTerm.length === 0) return null;

		const lines: string[] = [
			'# 사용자 기억 (MEMORY.md)',
			'',
			MEMORY_FILE_ABOUT,
			'',
			'방금 말한 사용자의 기억이에요. 다른 사용자의 기억을 섞지 마세요.',
			'',
			file
		];
		if (shortTerm.length > 0) {
			lines.push('', '## 단기 기억 (최근 대화)', ...shortTerm.map((turn) => `- 사용자: ${turn.q}\n  시루: ${turn.a}`));
		}
		return lines.join('\n');
	}
}
