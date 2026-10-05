/** 장기 기억 파일(MEMORY.md) 파싱/렌더링 — 봇 `aiMemoryService.ts`와 동일한 형식이에요. */

export type MemoryCategory = 'facts' | 'preferences' | 'commitments';
export const CATEGORIES: MemoryCategory[] = ['facts', 'preferences', 'commitments'];

const SECTION_TITLES: Record<MemoryCategory, string> = {
	facts: 'Facts',
	preferences: 'Preferences',
	commitments: 'Commitments'
};

const MEMORY_FILE_INTRO = '<!-- 시루가 모아둔 장기 기억: 오래가는 사실·선호·약속만. 일상 잡담은 남기지 않아요. -->';

const LONG_TERM_MAX = 40;

export type MemorySections = Record<MemoryCategory, string[]>;

export function emptySections(): MemorySections {
	return { facts: [], preferences: [], commitments: [] };
}

export function parseMemoryMarkdown(markdown: string): MemorySections {
	const sections = emptySections();
	if (!markdown) return sections;
	const lines = markdown.split('\n');
	let current: MemoryCategory | null = null;
	for (const rawLine of lines) {
		const line = rawLine.trim();
		const header = /^##\s+(.+)$/.exec(line);
		if (header) {
			const title = header[1]!.toLowerCase();
			const hit = CATEGORIES.find((c) => SECTION_TITLES[c].toLowerCase() === title);
			current = hit ?? null;
			continue;
		}
		if (line.startsWith('- ') && current) sections[current].push(line.slice(2).trim());
	}
	return sections;
}

export function renderMemoryMarkdown(sections: MemorySections): string {
	const lines = ['# MEMORY.md', '', MEMORY_FILE_INTRO];
	for (const category of CATEGORIES) {
		lines.push('', `## ${SECTION_TITLES[category]}`);
		if (sections[category].length > 0) lines.push(...sections[category].map((entry) => `- ${entry}`));
	}
	return lines.join('\n');
}

export function hasMemoryEntries(sections: MemorySections): boolean {
	return CATEGORIES.some((c) => sections[c].length > 0);
}

/** 섹션별 상한 — 최근 항목 우선으로 뒤에서 자라요. */
export function capMemorySections(sections: MemorySections): void {
	for (const category of CATEGORIES) {
		const list = sections[category];
		if (list.length > LONG_TERM_MAX) sections[category] = list.slice(list.length - LONG_TERM_MAX);
	}
}

/** 옛 배열 형태를 마크다운으로 변환 (레거시 호환) */
export function legacyToMarkdown(items: unknown[]): string {
	const sections = emptySections();
	for (const item of items) {
		if (!item || typeof item !== 'object') continue;
		const f = item as { text?: unknown; category?: unknown };
		if (typeof f.text !== 'string' || !f.text) continue;
		const category =
			typeof f.category === 'string' && CATEGORIES.includes(f.category as MemoryCategory) ? (f.category as MemoryCategory) : 'facts';
		sections[category].push(f.text.trim());
	}
	return renderMemoryMarkdown(sections);
}

export function countMarkdownEntries(markdown: string): number {
	const sections = parseMemoryMarkdown(markdown);
	return CATEGORIES.reduce((sum, category) => sum + sections[category].length, 0);
}
