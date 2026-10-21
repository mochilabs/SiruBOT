/**
 * 장기 기억 파일(MEMORY.md) 파싱/렌더링 — 봇 `aiMemoryService`와 data-api `memoryTidy`가 공유하는 단일 형식이에요.
 * 형식 계층(파서·렌더러)만 담아요. 상한 정책(봇: 총 40개 / data-api: 섹션별 40개)과 옛 배열 변환은 각 앱이 소유해요.
 * 공개 경로: 배럴 `@sirubot/utils` (node 앱 전용 — 대시보드 소비 계획 없음).
 */

/** 장기 기억 파일의 섹션 — 사실/선호/약속 */
export type MemoryCategory = 'facts' | 'preferences' | 'commitments';

export type MemorySections = Record<MemoryCategory, string[]>;

export const MEMORY_CATEGORIES: readonly MemoryCategory[] = ['facts', 'preferences', 'commitments'];

const SECTION_TITLES: Record<MemoryCategory, string> = {
	facts: 'Facts',
	preferences: 'Preferences',
	commitments: 'Commitments'
};

/** 파일 안에 들어가는 인트로 주석 (MEMORY.md 본문의 일부) */
const MEMORY_FILE_INTRO = '<!-- 시루가 모아둔 장기 기억: 오래가는 사실·선호·약속만. 일상 잡담은 남기지 않아요. -->';

export type ParseMemoryMarkdownOptions = {
	/**
	 * true(기본)면 섹션 헤더 밖의 불릿을 버려요 — data-api tidy가 LLM 출력·직접 편집된 파일에서
	 * 섹션 밖 항목을 세지 않기 위한 방어 동작이에요.
	 * false면 봇 런타임 동작으로, 헤더 전 불릿은 Facts로, 미등재 `##` 제목 아래 불릿은 마지막 섹션으로 이어 붙여요.
	 * `## Facts`처럼 등재된 제목이 나오면 두 모드가 같으므로 정상 형식 파일에서는 동치예요.
	 */
	strictSections?: boolean;
};

export function createEmptyMemorySections(): MemorySections {
	return { facts: [], preferences: [], commitments: [] };
}

/** 파일 마크다운을 섹션별 항목 목록으로 파싱해요 */
export function parseMemoryMarkdown(markdown: string, options: ParseMemoryMarkdownOptions = {}): MemorySections {
	const { strictSections = true } = options;
	const sections = createEmptyMemorySections();
	// 느슨한 모드에서는 헤더가 나오기 전의 불릿을 Facts로 보내요
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

/** 빈 섹션 헤더도 유지한 채 파일 마크다운을 만들어요 */
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
