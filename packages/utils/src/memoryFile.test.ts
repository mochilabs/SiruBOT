import { describe, expect, it } from 'vitest';
import {
	MEMORY_CATEGORIES,
	countMarkdownEntries,
	createEmptyMemorySections,
	hasMemoryEntries,
	parseMemoryMarkdown,
	renderMemoryMarkdown
} from './memoryFile.ts';

const CANONICAL_FILE = [
	'# MEMORY.md',
	'',
	'<!-- 시루가 모아둔 장기 기억: 오래가는 사실·선호·약속만. 일상 잡담은 남기지 않아요. -->',
	'',
	'## Facts',
	'- 부산 거주',
	'',
	'## Preferences',
	'- 재즈 선호',
	'',
	'## Commitments'
].join('\n');

describe('renderMemoryMarkdown', () => {
	it('빈 섹션 헤더도 유지한 정규 형식을 만들어요', () => {
		const markdown = renderMemoryMarkdown(createEmptyMemorySections());
		expect(markdown.startsWith('# MEMORY.md')).toBe(true);
		for (const title of ['## Facts', '## Preferences', '## Commitments']) {
			expect(markdown).toContain(title);
		}
	});

	it('섹션 항목을 헤더 아래 불릿으로 써요', () => {
		const markdown = renderMemoryMarkdown({ facts: ['부산 거주'], preferences: [], commitments: ['금요일까지 보고서'] });
		expect(markdown).toContain('## Facts\n- 부산 거주');
		expect(markdown).toContain('## Commitments\n- 금요일까지 보고서');
	});
});

describe('parseMemoryMarkdown', () => {
	it('정규 형식에서는 두 모드가 같은 결과를 내요', () => {
		const loose = parseMemoryMarkdown(CANONICAL_FILE, { strictSections: false });
		const strict = parseMemoryMarkdown(CANONICAL_FILE);
		expect(loose).toEqual(strict);
		expect(strict).toEqual({ facts: ['부산 거주'], preferences: ['재즈 선호'], commitments: [] });
	});

	it('strict(기본): 헤더 전 불릿과 미등재 헤더 아래 불릿을 버려요 (data-api 방어 동작)', () => {
		const markdown = ['- 헤더 전 항목', '## Todo', '- 미등재 헤더 항목', '## Facts', '- 사실 항목'].join('\n');
		const sections = parseMemoryMarkdown(markdown);
		expect(sections.facts).toEqual(['사실 항목']);
		expect(countMarkdownEntries(markdown)).toBe(1);
	});

	it('loose(strictSections: false): 헤더 전 불릿은 Facts로, 미등재 헤더 아래 불릿은 마지막 섹션에 이어요 (봇 런타임 동작)', () => {
		const markdown = ['- 헤더 전 항목', '## Facts', '- 사실 항목', '## Todo', '- 미등재 헤더 항목'].join('\n');
		const sections = parseMemoryMarkdown(markdown, { strictSections: false });
		expect(sections.facts).toEqual(['헤더 전 항목', '사실 항목', '미등재 헤더 항목']);
	});

	it('헤더 매칭은 대소문자를 구분하지 않고 줄 양끝 공백을 허용해요', () => {
		const sections = parseMemoryMarkdown('  ## facts  \n- 소문자 헤더 항목');
		expect(sections.facts).toEqual(['소문자 헤더 항목']);
	});

	it('빈 문자열은 빈 섹션이에요', () => {
		expect(parseMemoryMarkdown('')).toEqual(createEmptyMemorySections());
	});

	it('CRLF 개행도 파싱해요', () => {
		const sections = parseMemoryMarkdown('## Facts\r\n- 항목\r\n');
		expect(sections.facts).toEqual(['항목']);
	});
});

describe('hasMemoryEntries / countMarkdownEntries', () => {
	it('항목이 없으면 false/0', () => {
		const sections = createEmptyMemorySections();
		expect(hasMemoryEntries(sections)).toBe(false);
		expect(countMarkdownEntries(renderMemoryMarkdown(sections))).toBe(0);
	});

	it('항목이 있으면 true/개수', () => {
		expect(hasMemoryEntries(parseMemoryMarkdown(CANONICAL_FILE))).toBe(true);
		expect(countMarkdownEntries(CANONICAL_FILE)).toBe(2);
		expect(MEMORY_CATEGORIES).toEqual(['facts', 'preferences', 'commitments']);
	});

	it('countMarkdownEntries는 파싱 모드 옵션을 그대로 넘겨요', () => {
		expect(countMarkdownEntries('- 헤더 전 항목', { strictSections: false })).toBe(1);
		expect(countMarkdownEntries('- 헤더 전 항목')).toBe(0);
	});
});
