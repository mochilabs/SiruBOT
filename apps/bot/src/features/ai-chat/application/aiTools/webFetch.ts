import { lookup } from 'node:dns/promises';
import { isIPv4, isIPv6 } from 'node:net';
import { Agent, buildConnector } from 'undici';
import { stripTags } from './search.ts';
import type { AiTool } from './types.ts';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 400_000;
const MAX_TEXT_CHARS = 6_000;
const ALLOWED_CONTENT_TYPES = ['text/html', 'text/plain', 'application/xhtml+xml'];

/** 검사용 호스트명 정규화: 대시 소문자화 + [괄호] 제거 + 끝 dot 제거 (localhost. 형태 방어) */
function normalizeHostKey(hostname: string): string {
	return hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.+$/, '');
}

/** 사설·내부 IPv4 대역이에요 (0.x·10·127·169.254·172.16-31·192.168·CGNAT·멀티캐스트/예약) */
function isPrivateIpv4(ip: string): boolean {
	const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!v4) return false;
	const a = Number(v4[1]);
	const b = Number(v4[2]);
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		a >= 224 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 100 && b >= 64 && b <= 127)
	);
}

/** 마지막 콜론 뒤 dotted IPv4를 16비트 2그룹으로 바꿔 축약 IPv6를 전개할 수 있게 해요 */
function expandIpv6(host: string): string[] | null {
	let normalized = host;
	const dottedTail = normalized.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (dottedTail) {
		const octets = [Number(dottedTail[2]), Number(dottedTail[3]), Number(dottedTail[4]), Number(dottedTail[5])];
		if (octets.some((n) => n > 255)) return null;
		normalized = `${dottedTail[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
	}

	const [head, tail] = normalized.split('::');
	if (normalized.includes('::')) {
		const headParts = head ? head.split(':') : [];
		const tailParts = tail ? tail.split(':') : [];
		const missing = 8 - headParts.length - tailParts.length;
		if (missing <= 0) return null;
		const groups = [...headParts, ...Array<string>(missing).fill('0'), ...tailParts];
		return groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g)) ? groups : null;
	}

	const groups = normalized.split(':');
	return groups.length === 8 && groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g)) ? groups : null;
}

function toDottedIpv4(hexHigh: string, hexLow: string): string {
	const high = Number.parseInt(hexHigh, 16);
	const low = Number.parseInt(hexLow, 16);
	return `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
}

/**
 * IPv4-매핑/호환 IPv6(::ffff:127.0.0.1, ::ffff:7f00:1, 0:0:0:0:0:0:10.0.0.1 등)를 IPv4로 정규화해요.
 * 해당 아니면 null이에요.
 */
function mappedIpv6ToIpv4(host: string): string | null {
	const groups = expandIpv6(host);
	if (!groups) return null;
	if (!groups.slice(0, 5).every((g) => g === '0')) return null;
	if (groups[5] !== 'ffff' && groups[5] !== '0') return null;
	return toDottedIpv4(groups[6], groups[7]);
}

/** NAT64(64:ff9b::/96, 64:ff9b:1::/48) 주소 중 내부로 이어지는 형태를 판정해요 */
function isInternalNat64(host: string): boolean {
	const groups = expandIpv6(host);
	if (!groups) return false;
	if (groups[0] !== '64' || groups[1] !== 'ff9b') return false;
	// 로컬 사용 프리픽스(64:ff9b:1::/48)는 내부 전용이에요
	if (groups[2] === '1') return true;
	// 웰노운 프리픽스 아래 32비트가 사설 IPv4면 내부 접근 시도예요
	if (!groups.slice(2, 6).every((g) => g === '0')) return false;
	return isPrivateIpv4(toDottedIpv4(groups[6], groups[7]));
}

/** 사설·내부 주소는 가져오지 않아요 (SSRF 방지: 정규화 + 매핑 IPv6 + NAT64 포함) */
function assertPublicHost(hostname: string): void {
	if (isInternalHost(hostname)) throw new Error('내부 주소는 조회할 수 없어요.');
}

function isInternalHost(hostname: string): boolean {
	const host = normalizeHostKey(hostname);
	const mapped = mappedIpv6ToIpv4(host);
	if (mapped) return isPrivateIpv4(mapped);
	if (isInternalNat64(host)) return true;
	if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
	if (isIPv4(host)) return isPrivateIpv4(host);
	if (isIPv6(host)) {
		if (host === '::' || host === '::1') return true;
		if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host) || /^ff/.test(host)) return true;
		return false;
	}
	return false;
}

/**
 * DNS 조회 결과(A/AAAA 전부)를 사설 주소 필터에 통과시켜요 (DNS 리바인딩 완화).
 * 하나라도 내부 주소면 조회 자체를 거절해요.
 */
async function resolvePublicAddresses(hostname: string): Promise<{ address: string; family: number }[]> {
	if (isInternalHost(hostname)) throw new Error('내부 주소는 조회할 수 없어요.');
	const results = await lookup(hostname, { all: true, verbatim: true }).catch(() => undefined);
	if (!results?.length) throw new Error('호스트를 찾지 못했어요.');
	for (const { address } of results) {
		if (isInternalHost(address)) throw new Error('내부 주소는 조회할 수 없어요.');
	}
	return results;
}

// fetch 직전 소켓 연결 단계에서도 DNS 재검증을 수행해요 (토이 호스트 표기 우회·리바인딩 방화벽)
const connect = buildConnector({});
const ssrfGuardAgent = new Agent({
	connect: (options, callback) => {
		resolvePublicAddresses(options.hostname)
			.then((addresses) => {
				// 듀얼스택이면 IPv4 우선 — 기본 동작과 비슷한 도달성을 유지해요
				const pick = addresses.find((a) => a.family === 4) ?? addresses[0];
				if (!pick) throw new Error('호스트를 찾지 못했어요.');
				// SNI·인증서 검증은 원래 hostname 기준을 유지해요
				connect({ ...options, hostname: pick.address, servername: options.servername ?? normalizeHostKey(options.hostname) }, callback);
			})
			.catch((error) => callback(error instanceof Error ? error : new Error(String(error)), null));
	}
});
// Node 내장 fetch의 Dispatcher 타입과 undici 버전 간 시그니처 차이를 묶어주는 어댑터예요
const ssrfDispatcher = ssrfGuardAgent as unknown as Parameters<typeof fetch>[1] extends infer TInit
	? TInit extends { dispatcher?: infer D }
		? D
		: never
	: never;

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
				dispatcher: ssrfDispatcher,
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
