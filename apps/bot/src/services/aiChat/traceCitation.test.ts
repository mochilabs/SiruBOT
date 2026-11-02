import { describe, expect, it } from 'vitest';
import { appendCitedSources, extractWebSearchSources, normalizeCommaCitations } from './traceCitation.ts';

describe('traceCitation service', () => {
	describe('extractWebSearchSources', () => {
		it('extracts sources from web_search tool output', () => {
			const messages = [
				{
					role: 'tool',
					tool_call_id: 'call_1',
					content: JSON.stringify({
						status: 'success',
						sources: [
							{ id: 'S1', title: 'Example Title', url: 'https://example.com' },
							{ id: 'S2', title: 'Second Title', url: 'https://second.example.com' }
						]
					})
				}
			];

			const sourceMap = extractWebSearchSources(messages);
			expect(sourceMap.size).toBe(2);
			expect(sourceMap.get('S1')).toEqual({ title: 'Example Title', url: 'https://example.com' });
			expect(sourceMap.get('S2')).toEqual({ title: 'Second Title', url: 'https://second.example.com' });
		});

		it('handles legacy results property and invalid entries gracefully', () => {
			const messages = [
				{
					role: 'tool',
					tool_call_id: 'call_legacy',
					content: JSON.stringify({
						results: [{ title: 'Legacy Title', url: 'https://legacy.example.com' }, { title: 'No URL' }]
					})
				},
				{ role: 'user', content: 'hello' }
			];

			const sourceMap = extractWebSearchSources(messages);
			expect(sourceMap.size).toBe(1);
			expect(sourceMap.get('S1')).toEqual({ title: 'Legacy Title', url: 'https://legacy.example.com' });
		});
	});

	describe('normalizeCommaCitations', () => {
		it('splits grouped brackets [S1, S2, S3] into individual bracket tags', () => {
			const input = '최근 통계에 따르면 [S1, S2, S3]에 나와 있습니다.';
			const normalized = normalizeCommaCitations(input);
			expect(normalized).toBe('최근 통계에 따르면 [S1] [S2] [S3]에 나와 있습니다.');
		});

		it('splits grouped parentheses (S1, S2) into individual tags', () => {
			const input = '주요 지표입니다 (S1, S2).';
			const normalized = normalizeCommaCitations(input);
			expect(normalized).toBe('주요 지표입니다 (S1) (S2).');
		});
	});

	describe('appendCitedSources', () => {
		const sampleMessages = [
			{
				role: 'tool',
				tool_call_id: 'c1',
				content: JSON.stringify({
					sources: [
						{ id: 'S1', title: 'SiruBOT 공식 사이트', url: 'https://sirubot.com' },
						{ id: 'S2', title: '문서 센터', url: 'https://docs.sirubot.com' }
					]
				})
			}
		];

		it('replaces [S1] with superscript markdown links and appends bibliography', () => {
			const text = '시루봇은 고품질 음악 봇이에요 [S1]. 자세한 기능은 문서에서 확인하세요 [S2].';
			const result = appendCitedSources(text, sampleMessages);

			expect(result).toContain('[¹](https://sirubot.com)');
			expect(result).toContain('[²](https://docs.sirubot.com)');
			expect(result).toContain('> -# **📚 사용한 출처**');
			expect(result).toContain('> -# [1] [SiruBOT 공식 사이트](https://sirubot.com)');
			expect(result).toContain('> -# [2] [문서 센터](https://docs.sirubot.com)');
		});

		it('handles parenthesis citation style (S1)', () => {
			const text = '시루봇 기능 (S1) 참고';
			const result = appendCitedSources(text, sampleMessages);
			expect(result).toContain('[¹](https://sirubot.com)');
			expect(result).toContain('> -# [1] [SiruBOT 공식 사이트](https://sirubot.com)');
		});

		it('only includes cited sources in bibliography', () => {
			const text = '시루봇 기능입니다 [S2].';
			const result = appendCitedSources(text, sampleMessages);
			expect(result).toContain('[²](https://docs.sirubot.com)');
			expect(result).toContain('> -# [2] [문서 센터](https://docs.sirubot.com)');
			expect(result).not.toContain('SiruBOT 공식 사이트');
		});

		it('returns original text unchanged when no sources match', () => {
			const text = '아무 출처도 없는 일반 답변입니다.';
			const result = appendCitedSources(text, sampleMessages);
			expect(result).toBe('아무 출처도 없는 일반 답변입니다.');
		});
	});
});
