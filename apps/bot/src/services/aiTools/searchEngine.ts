export interface WebSearchResultItem {
	id: string;
	title: string;
	url: string;
	snippet: string;
}

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

/** SearXNG 인스턴스로 검색을 시도해요 */
export async function searchSearxng(baseUrl: string, query: string, maxResults: number, language = 'ko-KR'): Promise<WebSearchResultItem[]> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
	try {
		const url = new URL(`${baseUrl.replace(/\/+$/, '')}/search`);
		url.searchParams.set('q', query);
		url.searchParams.set('format', 'json');
		url.searchParams.set('language', language);
		url.searchParams.set('safesearch', '1');

		const res = await fetch(url.toString(), {
			signal: controller.signal,
			headers: {
				Accept: 'application/json',
				'User-Agent': 'SiruBOT/1.0 (+ai_web_search)'
			}
		});
		if (!res.ok) throw new Error(`SearXNG HTTP error (${res.status})`);
		const body = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
		const results = (body?.results ?? [])
			.filter((r) => r && typeof r.url === 'string' && r.url.startsWith('http'))
			.slice(0, maxResults)
			.map((r, i) => ({
				id: `S${i + 1}`,
				title: String(r.title ?? '')
					.slice(0, 200)
					.trim(),
				url: String(r.url ?? '').trim(),
				snippet: String(r.content ?? '')
					.slice(0, 500)
					.trim()
			}));

		return results;
	} finally {
		clearTimeout(timer);
	}
}

/** DuckDuckGo Lite로 검색해요 (SearXNG 미설정 또는 오류 시 폴백) */
export async function searchLite(query: string, maxResults: number): Promise<WebSearchResultItem[]> {
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
			id: `S${index + 1}`,
			title: link.title.slice(0, 200).trim(),
			url: link.url.trim(),
			snippet: (snippets[index] ?? '').slice(0, 300).trim()
		}));

		return results;
	} finally {
		clearTimeout(timer);
	}
}

/** SearXNG 우선, 실패 시 DuckDuckGo 폴백 검색 실행기 */
export async function performWebSearch(query: string, maxResults: number, language = 'ko-KR'): Promise<WebSearchResultItem[]> {
	const enableSearxng = (process.env.ENABLE_SEARXNG ?? 'true').toLowerCase() !== 'false';
	const searxngBaseUrl = process.env.SEARXNG_BASE_URL?.trim();

	if (enableSearxng && searxngBaseUrl) {
		try {
			const searxResults = await searchSearxng(searxngBaseUrl, query, maxResults, language);
			if (searxResults.length > 0) return searxResults;
		} catch {
			// SearXNG 오류 발생 시 DuckDuckGo로 폴백 진행
		}
	}

	const fallbackResults = await searchLite(query, maxResults);
	if (fallbackResults.length === 0) {
		throw new Error('검색 결과를 찾지 못했어요. 다른 검색어로 시도해 주세요.');
	}
	return fallbackResults;
}
