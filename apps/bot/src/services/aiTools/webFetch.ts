import { stripTags } from './search.ts';
import type { AiTool } from './types.ts';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 400_000;
const MAX_TEXT_CHARS = 6_000;
const ALLOWED_CONTENT_TYPES = ['text/html', 'text/plain', 'application/xhtml+xml'];

/** 사설·내부 주소는 가져오지 않아요 (기본 SSRF 방지) */
function assertPublicHost(hostname: string): void {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
	const isInternal =
		host === 'localhost' ||
		host === '::1' ||
		host === '::' ||
		host.endsWith('.localhost') ||
		host.endsWith('.local') ||
		host.endsWith('.internal') ||
		host.startsWith('fc') ||
		host.startsWith('fd') ||
		/^fe[89ab]/.test(host);
	if (isInternal) throw new Error('내부 주소는 조회할 수 없어요.');

	const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (v4) {
		const a = Number(v4[1]);
		const b = Number(v4[2]);
		const isPrivate =
			a === 0 ||
			a === 10 ||
			a === 127 ||
			a >= 224 ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 100 && b >= 64 && b <= 127);
		if (isPrivate) throw new Error('내부 주소는 조회할 수 없어요.');
	}
}

function parseHttpUrl(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new Error('올바른 URL이 아니에요. (예: https://example.com)');
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('http/https 주소만 조회할 수 있어요.');
	assertPublicHost(url.hostname);
	return url;
}

async function readCapped(body: ReadableStream<Uint8Array>): Promise<{ bytes: Buffer; capped: boolean }> {
	const reader = body.getReader();
	const chunks: Buffer[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		chunks.push(Buffer.from(value));
		total += value.byteLength;
		if (total >= MAX_BYTES) {
			await reader.cancel().catch(() => undefined);
			return { bytes: Buffer.concat(chunks), capped: true };
		}
	}
	return { bytes: Buffer.concat(chunks), capped: false };
}

export const webFetchTool: AiTool = {
	name: 'web_fetch',
	description:
		'웹 페이지의 본문 텍스트를 가져와요. web_search 결과 URL의 원문이 필요하거나 사용자가 준 주소를 요약할 때 써요. http/https만 가능하고 텍스트(HTML·plain)만 읽어요. 결과의 text를 바탕으로 한국어로 요약하세요.',
	properties: {
		url: {
			type: 'string',
			description: '조회할 페이지 주소 (https://...)'
		}
	},
	required: ['url'],
	status: '시루가 웹 페이지를 가져오는 중..',
	execute: async (args) => {
		const url = parseHttpUrl(String(args.url ?? ''));

		let res: Response;
		try {
			res = await fetch(url, {
				redirect: 'follow',
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
				headers: {
					'User-Agent': 'SiruBOT/1.0 (+web_fetch)',
					Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
					'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
				}
			});
		} catch (error) {
			throw new Error(`페이지 요청에 실패했어요. (${error instanceof Error ? error.message : String(error)})`);
		}

		// 리다이렉트로 내부 주소로 갈아타는 것을 막아요
		if (res.url) parseHttpUrl(res.url);
		if (!res.ok) throw new Error(`페이지를 가져오지 못했어요. (HTTP ${res.status})`);

		const contentType = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
		if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) throw new Error(`텍스트 페이지만 조회할 수 있어요. (${contentType})`);
		if (!res.body) throw new Error('페이지 내용을 읽을 수 없어요.');

		const { bytes, capped } = await readCapped(res.body);
		const raw = bytes.toString('utf8');

		let title = '';
		let text: string;
		if (contentType === 'text/plain') {
			text = raw.replace(/\s+/g, ' ').trim();
		} else {
			const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
			if (titleMatch) title = stripTags(titleMatch[1] ?? '').slice(0, 200);
			const cleaned = raw
				.replace(/<script[\s\S]*?<\/script>/gi, ' ')
				.replace(/<style[\s\S]*?<\/style>/gi, ' ')
				.replace(/<!--[\s\S]*?-->/g, ' ');
			text = stripTags(cleaned);
		}

		if (!text) throw new Error('페이지에서 텍스트를 찾지 못했어요.');
		const truncated = capped || text.length > MAX_TEXT_CHARS;
		const body = truncated ? `${text.slice(0, MAX_TEXT_CHARS)}…` : text;
		return JSON.stringify({ url: res.url || url.toString(), title: title || null, text: body, truncated });
	}
};
