export type MemoryCategory = 'facts' | 'preferences' | 'commitments';

export type MemorySections = Record<MemoryCategory, string[]>;

export const MEMORY_CATEGORIES: readonly MemoryCategory[] = ['facts', 'preferences', 'commitments'];

const SECTION_TITLES: Record<MemoryCategory, string> = {
	facts: 'Facts',
	preferences: 'Preferences',
	commitments: 'Commitments'
};

const MEMORY_FILE_INTRO = '<!-- 시루가 모아둔 장기 기억: 오래가는 사실·선호·약속만. 일상 잡담은 남기지 않아요. -->';

export type ParseMemoryMarkdownOptions = {
	// false keeps bot runtime tolerance for bullets before/under unlisted headings.
	strictSections?: boolean;
};

export function createEmptyMemorySections(): MemorySections {
	return { facts: [], preferences: [], commitments: [] };
}

export function parseMemoryMarkdown(markdown: string, options: ParseMemoryMarkdownOptions = {}): MemorySections {
	const { strictSections = true } = options;
	const sections = createEmptyMemorySections();
	let current: MemoryCategory | null = strictSections ? null : 'facts';
	for (const rawLine of markdown.split('\n')) {
		const line = rawLine.trim();
		if (strictSections) {
			const heading = /^##\s+(.+)$/.exec(line);
			if (heading) {
				const title = heading[1]!.toLowerCase();
				current = MEMORY_CATEGORIES.find((category) => SECTION_TITLES[category].toLowerCase() === title) ?? null;
				continue;
			}
		} else {
			const heading = /^##\s+(Facts|Preferences|Commitments)\s*$/i.exec(line);
			if (heading) {
				current = heading[1]!.toLowerCase() as MemoryCategory;
				continue;
			}
		}
		if (line.startsWith('- ') && current) sections[current].push(line.slice(2).trim());
	}
	return sections;
}

export function renderMemoryMarkdown(sections: MemorySections): string {
	const lines = ['# MEMORY.md', '', MEMORY_FILE_INTRO];
	for (const category of MEMORY_CATEGORIES) {
		lines.push('', `## ${SECTION_TITLES[category]}`);
		if (sections[category].length > 0) lines.push(...sections[category].map((entry) => `- ${entry}`));
	}
	return lines.join('\n');
}

export function hasMemoryEntries(sections: MemorySections): boolean {
	return MEMORY_CATEGORIES.some((category) => sections[category].length > 0);
}

export function countMarkdownEntries(markdown: string, options?: ParseMemoryMarkdownOptions): number {
	const sections = parseMemoryMarkdown(markdown, options);
	return MEMORY_CATEGORIES.reduce((sum, category) => sum + sections[category].length, 0);
}
