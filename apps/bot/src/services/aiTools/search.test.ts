import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performWebSearch, searchLite, searchSearxng } from './searchEngine.ts';
import { webSearchTool } from './search.ts';
import type { AiToolContext } from './types.ts';

describe('searchEngine', () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.unstubAllGlobals();
	});

	it('parses SearXNG JSON response properly', async () => {
		const mockResponse = {
			results: [
				{
					title: '테스트 타이틀',
					url: 'https://test.example.com',
					content: '테스트 내용입니다.'
				}
			]
		};

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse
			})
		);

		const items = await searchSearxng('http://localhost:8888', '테스트', 5);
		expect(items).toHaveLength(1);
		expect(items[0]).toEqual({
			id: 'S1',
			title: '테스트 타이틀',
			url: 'https://test.example.com',
			snippet: '테스트 내용입니다.'
		});
	});

	it('parses DuckDuckGo Lite html response properly', async () => {
		const mockHtml = `
			<table>
				<tr>
					<td><a href="https://ddg.example.com/target">테스트 검색 결과</a></td>
				</tr>
				<tr>
					<td class="result-snippet">검색 결과 설명문</td>
				</tr>
			</table>
		`;

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				text: async () => mockHtml
			})
		);

		const items = await searchLite('테스트', 5);
		expect(items).toHaveLength(1);
		expect(items[0]).toEqual({
			id: 'S1',
			title: '테스트 검색 결과',
			url: 'https://ddg.example.com/target',
			snippet: '검색 결과 설명문'
		});
	});

	it('falls back to searchLite if SearXNG fails', async () => {
		process.env.ENABLE_SEARXNG = 'true';
		process.env.SEARXNG_BASE_URL = 'http://localhost:8888';

		const mockHtml = `
			<table>
				<tr>
					<td><a href="https://fallback.example.com">폴백 결과</a></td>
				</tr>
				<tr>
					<td class="result-snippet">폴백 내용</td>
				</tr>
			</table>
		`;

		let callCount = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(async (url: string) => {
				callCount++;
				if (url.includes('localhost:8888')) {
					return { ok: false, status: 500 };
				}
				return {
					ok: true,
					text: async () => mockHtml
				};
			})
		);

		const items = await performWebSearch('테스트', 5);
		expect(callCount).toBe(2);
		expect(items[0]?.title).toBe('폴백 결과');
	});

	it('webSearchTool returns structured sources in execution result', async () => {
		const mockHtml = `
			<table>
				<tr>
					<td><a href="https://ddg.example.com/news">최신 뉴스</a></td>
				</tr>
				<tr>
					<td class="result-snippet">뉴스 내용</td>
				</tr>
			</table>
		`;

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				text: async () => mockHtml
			})
		);

		const dummyContext: AiToolContext = {
			userId: 'test-user',
			username: 'test-user',
			channelId: 'test-channel',
			guildId: 'test-guild',
			voiceChannelId: null,
			member: null
		};
		const outputStr = await webSearchTool.execute({ query: '뉴스' }, dummyContext);
		const parsed = JSON.parse(outputStr);
		expect(parsed.status).toBe('success');
		expect(parsed.sources).toBeInstanceOf(Array);
		expect(parsed.sources[0]).toEqual({
			id: 'S1',
			title: '최신 뉴스',
			url: 'https://ddg.example.com/news',
			snippet: '뉴스 내용'
		});
	});
});
