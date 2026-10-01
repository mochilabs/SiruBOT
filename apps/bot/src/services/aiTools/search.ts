import type { AiTool } from './types.ts';

const SEARCH_TIMEOUT_MS = 10_000;

function decodeEntities(text: string): string {
	return text
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&nbsp;/g, ' ');
}

export function stripTags(html: string): string {
	return decodeEntities(html.replace(/<[^>]*>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();
}

/** DuckDuckGo 리다이렉트 URL에서 실제 주소 추출 */
function unwrapUrl(raw: string): string {
	const decoded = decodeEntities(raw);
	try {
		const normalized = decoded.startsWith('//') ? `https:${decoded}` : decoded;
		const url = new URL(normalized);
		const target = url.searchParams.get('uddg');
		if (target) return target;
		return url.toString();
	} catch {
		return decoded;
	}
}

async function searchLite(query: string, maxResults: number) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
	try {
		const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
			signal: controller.signal,
			headers: {
				'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
				'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
			}
		});
		if (!res.ok) throw new Error(`검색 엔진이 응답하지 않아요. (HTTP ${res.status})`);
		const html = await res.text();

		const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
			.map((match) => ({ url: unwrapUrl(match[1] ?? ''), title: stripTags(match[2] ?? '') }))
			.filter((item) => item.url.startsWith('http') && item.title && !item.url.includes('duckduckgo.com'));

		const snippets = [...html.matchAll(/<td class=["']result-snippet["']>([\s\S]*?)<\/td>/gi)].map((match) => stripTags(match[1] ?? ''));

		const results = links.slice(0, maxResults).map((link, index) => ({
			title: link.title,
			url: link.url,
			snippet: (snippets[index] ?? '').slice(0, 300)
		}));

		if (results.length === 0) throw new Error('검색 결과를 찾지 못했어요. 다른 검색어로 시도해 주세요.');
		return results;
	} finally {
		clearTimeout(timer);
	}
}

export const webSearchTool: AiTool = {
	name: 'web_search',
	description:
		'웹 검색을 수행해 최신·실시간 정보(뉴스, 일정, 가격, 이슈, 인물, 최신 사건)를 확인해요. 날씨·배송 조회는 각각 전용 도구를 쓰고, 그 외 사실 확인이 필요하면 이 도구를 사용하세요. 검색 결과의 URL과 스니펫을 근거로 답하세요.',
	properties: {
		query: {
			type: 'string',
			description: '검색어 (자연어 질문이어도 괜찮아요. 핵심 키워드로 줄이면 좋아요)'
		},
		max_results: {
			type: 'integer',
			description: '돌려줄 결과 개수 (기본 5, 최대 10)'
		}
	},
	required: ['query'],
	status: '시루가 인터넷 검색을 하는 중..',
	execute: async (args) => {
		const query = String(args.query ?? '').trim();
		if (!query) throw new Error('검색어가 필요해요.');
		const maxResults = Math.min(Math.max(Number(args.max_results) || 5, 1), 10);
		const results = await searchLite(query, maxResults);
		return JSON.stringify({ query, results });
	}
};
