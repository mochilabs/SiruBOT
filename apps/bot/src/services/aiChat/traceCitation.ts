interface SourceItem {
	id: string;
	title: string;
	url: string;
}

/** 도구 실행 결과 JSON 문자열에서 sources 배열을 안전하게 추출해요 */
function parseSourcesFromResult(parsed: Record<string, unknown> | null): SourceItem[] {
	if (!parsed) return [];
	const raw = parsed.sources ?? (Array.isArray(parsed.results) ? parsed.results : null);
	if (!Array.isArray(raw)) return [];
	return raw
		.map((s: unknown, index: number) => {
			if (!s || typeof s !== 'object') return null;
			const obj = s as Record<string, unknown>;
			const rawId = typeof obj.id === 'string' ? obj.id.trim() : `S${index + 1}`;
			const title = typeof obj.title === 'string' ? obj.title.trim() : '';
			const url = typeof obj.url === 'string' ? obj.url.trim() : '';
			return { id: rawId, title, url };
		})
		.filter((s): s is SourceItem => Boolean(s && s.id && s.url));
}

/** 대화 루프 메시지(trace)에서 web_search 도구 호출 결과의 출처 맵을 구성해요 */
export function extractWebSearchSources(
	messages: ReadonlyArray<{ role: string; content?: unknown; tool_call_id?: string; name?: string }>
): Map<string, { title: string; url: string }> {
	const out = new Map<string, { title: string; url: string }>();
	if (!Array.isArray(messages)) return out;

	for (const msg of messages) {
		if (!msg || msg.role !== 'tool') continue;
		const content = typeof msg.content === 'string' ? msg.content.trim() : '';
		if (!content) continue;

		let parsed: Record<string, unknown> | null = null;
		try {
			const obj = JSON.parse(content) as unknown;
			if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
				parsed = obj as Record<string, unknown>;
			}
		} catch {
			parsed = null;
		}

		if (!parsed) continue;
		const sources = parseSourcesFromResult(parsed);
		for (const s of sources) {
			const id = s.id.toUpperCase();
			if (!/^S\d+$/.test(id) || !s.url) continue;
			out.set(id, { title: s.title || id, url: s.url });
		}
	}
	return out;
}

/**
 * [S1, S2, S3] 또는 (S1, S2) 같은 묶음 인용 표기를 [S1] [S2] [S3] 형태로 정규화해요
 */
export function normalizeCommaCitations(text: string): string {
	let current = text.replace(/\[\s*(S\d+(?:\s*,\s*S\d+)+)\s*\]/gi, (_full, match) => {
		const parts = match.split(',').map((p: string) => `[${p.trim()}]`);
		return parts.join(' ');
	});
	current = current.replace(/\(\s*(S\d+(?:\s*,\s*S\d+)+)\s*\)/gi, (_full, match) => {
		const parts = match.split(',').map((p: string) => `(${p.trim()})`);
		return parts.join(' ');
	});
	return current;
}

const SUPERSCRIPTS: Record<string, string> = {
	'0': '⁰',
	'1': '¹',
	'2': '²',
	'3': '³',
	'4': '⁴',
	'5': '⁵',
	'6': '⁶',
	'7': '⁷',
	'8': '⁸',
	'9': '⁹'
};

function toSuperscript(numStr: string): string {
	return numStr
		.split('')
		.map((c) => SUPERSCRIPTS[c] || c)
		.join('');
}

/**
 * 모델이 생성한 최종 답변에 인용된 [S1], [S2] 태그를 위첨자 하이퍼링크 [¹](url)로 바꾸고,
 * 사용된 출처 목록(Bibliography)을 하단에 Discord 소형 인용문(-#)으로 첨부해요.
 */
export function appendCitedSources(
	finalText: string,
	messages: ReadonlyArray<{ role: string; content?: unknown; tool_call_id?: string; name?: string }>
): string {
	const text = normalizeCommaCitations(String(finalText ?? '').trim());
	if (!text) return text;

	const sourceMap = extractWebSearchSources(messages);
	if (sourceMap.size === 0) return text;

	const usedSources = new Map<string, { id: string; title: string; url: string }>();

	const renderCitation = (rawId: unknown): string => {
		const id = String(rawId ?? '').toUpperCase();
		const src = sourceMap.get(id);
		if (!src) return `[${id}]`;

		usedSources.set(id, { id, title: src.title, url: src.url });
		const num = id.replace(/[^0-9]/g, '');
		const superNum = toSuperscript(num);
		return `[${superNum}](${src.url})`;
	};

	let renderedText = text
		.replace(/\[(S\d+)\]/gi, (_, rawId) => renderCitation(rawId) + ' ')
		.replace(/\((S\d+)\)/gi, (_, rawId) => renderCitation(rawId) + ' ')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/ {2,}/g, ' ')
		.trim();

	if (usedSources.size > 0) {
		const sourceLines = Array.from(usedSources.values())
			.sort((a, b) => {
				const numA = parseInt(a.id.replace(/[^0-9]/g, ''), 10) || 0;
				const numB = parseInt(b.id.replace(/[^0-9]/g, ''), 10) || 0;
				return numA - numB;
			})
			.map((s) => {
				const num = s.id.replace(/[^0-9]/g, '');
				const title = s.title.trim() || s.url;
				return `> -# [${num}] [${title}](${s.url})`;
			});

		renderedText += '\n\n> -# **📚 사용한 출처**\n' + sourceLines.join('\n');
	}

	return renderedText;
}
