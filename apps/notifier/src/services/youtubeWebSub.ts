import { createHmac, timingSafeEqual } from 'node:crypto';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { socialEventSchema, type SocialEvent } from '@sirubot/utils';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('youtubeWebSub');

const USER_AGENT = 'SiruBOT-Social-Notifier/1.0';

// 유튜브 WebSub hub: 채널 업로드 topic을 이 허브에 등록해요 (공식, 무료).
const YOUTUBE_HUB_URL = 'https://pubsubhubbub.appspot.com/';
// 유튜브가 주는 최대 lease: 약 5일. 갱신 스케줄러가 만료 전에 재등록해요 (재전송이 없어서 놓치면 유실).
export const YOUTUBE_LEASE_SECONDS = 432_000;

export type YouTubeFetchFn = (input: string, init?: RequestInit) => Promise<Response>;

// 상태 없는 파서라 모듈에 하나만 둬요. 속성(href)도 읽어야 하므로 ignoreAttributes: false.
const feedParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function uploadsFeedUrl(channelId: string): string {
	return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

/** hub에 채널 topic 구독 등록/갱신: 2xx면 접수 성공 (실제 검증은 hub가 challenge GET으로 확인해요). */
export async function subscribeYouTubeChannel(options: {
	channelId: string;
	callbackUrl: string;
	secret: string;
	leaseSeconds?: number;
	fetchFn?: YouTubeFetchFn;
}): Promise<boolean> {
	const fetchFn = options.fetchFn ?? fetch;
	const leaseSeconds = options.leaseSeconds ?? YOUTUBE_LEASE_SECONDS;
	const body = new URLSearchParams({
		'hub.mode': 'subscribe',
		'hub.callback': options.callbackUrl,
		'hub.topic': uploadsFeedUrl(options.channelId),
		'hub.lease_seconds': String(leaseSeconds),
		'hub.secret': options.secret
	});
	try {
		const response = await fetchFn(YOUTUBE_HUB_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body,
			signal: AbortSignal.timeout(8_000)
		});
		if (!response.ok) {
			logger.warn(`유튜브 hub 등록 실패 (${options.channelId}): HTTP ${response.status}`);
			return false;
		}
		return true;
	} catch (error) {
		logger.warn(`유튜브 hub 등록 요청 실패 (${options.channelId}):`, String(error));
		return false;
	}
}

/** X-Hub-Signature: sha256=<hex> 검증: 등록 시 보낸 hub.secret의 HMAC이에요 (plan §8). */
export function verifyWebSubSignature(rawBody: string, header: string | undefined, secret: string): boolean {
	if (!header?.startsWith('sha256=')) return false;
	const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
	const actual = Buffer.from(header.slice('sha256='.length), 'hex');
	if (actual.length !== expected.length) return false;
	return timingSafeEqual(actual, expected);
}

/** 업로드 피드(ATOM) 1회 fetch: RSS 감사 폴링이 써요 (WebSub 유실 보강, plan §8). */
export async function fetchYouTubeUploadsFeed(channelId: string, fetchFn: YouTubeFetchFn = fetch): Promise<string> {
	const response = await fetchFn(uploadsFeedUrl(channelId), {
		headers: { 'User-Agent': USER_AGENT, Accept: 'application/atom+xml, application/xml, text/xml, */*' },
		signal: AbortSignal.timeout(8_000)
	});
	if (!response.ok) throw new Error(`유튜브 피드 fetch 실패: HTTP ${response.status}`);
	return response.text();
}

export interface ResolvedYouTubeChannel {
	channelId: string;
	channelName: string | null;
}

/** UC id / @핸들 / 채널 URL을 UC 채널 ID로 정귬화해요 (plan §5: 핸들은 채널 페이지 1회 fetch로 해석). */
export async function resolveYouTubeChannel(input: string, fetchFn: YouTubeFetchFn = fetch): Promise<ResolvedYouTubeChannel> {
	const trimmed = input.trim();
	const direct = trimmed.match(/(UC[\w-]{22})/);
	if (direct) return { channelId: direct[1], channelName: null };

	let pageUrl: string;
	if (trimmed.startsWith('@')) pageUrl = `https://www.youtube.com/${trimmed}`;
	else if (/^https?:\/\//.test(trimmed)) pageUrl = trimmed;
	else pageUrl = `https://www.youtube.com/@${encodeURIComponent(trimmed)}`;

	const response = await fetchFn(pageUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) });
	if (!response.ok) throw new Error(`유튜브 채널 페이지 조회 실패: HTTP ${response.status}`);
	const html = await response.text();
	const channelId = html.match(/"channelId":"(UC[\w-]{22})"/)?.[1] ?? html.match(/channel\/(UC[\w-]{22})/)?.[1];
	if (!channelId) throw new Error('채널 ID(UC...)를 찾지 못했어요. 입력값을 확인해 주세요.');
	// 페이지 <title>은 HTML이지 XML 파싱 대상이 아니라 단일 태그 추출로 충분해요.
	const rawTitle = html.match(/<title>([^<]*)<\/title>/)?.[1];
	const channelName = rawTitle
		? decodeEntities(rawTitle)
				.replace(/\s*-\s*YouTube\s*$/, '')
				.trim() || null
		: null;
	return { channelId, channelName };
}

/** 유튜브 업로드 피드(ATOM)를 SocialEvent로 정규화해요. WebSub 콜백과 RSS 감사가 같은 문서를 써요. */
export function parseYouTubeAtomFeed(xml: string): { channelId: string | null; events: SocialEvent[] } {
	const validation = XMLValidator.validate(xml);
	if (validation !== true) {
		logger.warn('유튜브 피드 XML 검증 실패: 파싱을 건너뛰어요.');
		return { channelId: null, events: [] };
	}
	const doc = asRecord(feedParser.parse(xml));
	if (!doc) return { channelId: null, events: [] };
	// 실제 유튜브 피드는 <feed>가 루트라 파서 결과가 { feed: { ... } } 모양이에요. 없으면 루트 자체를 써요.
	const feed = asRecord(doc['feed']) ?? doc;
	const channelId = firstString(feed['yt:channelId']);
	if (!channelId) return { channelId: null, events: [] };

	const rawEntries = feed['entry'];
	const entries = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : [];
	const events: SocialEvent[] = [];
	for (const raw of entries) {
		const entry = asRecord(raw);
		if (!entry) continue;
		const videoId = firstString(entry['yt:videoId']);
		const title = firstString(entry['title']);
		const published = firstString(entry['published']);
		if (!videoId || !title || !published) continue;
		const url = pickAlternateHref(entry['link']) ?? `https://www.youtube.com/watch?v=${videoId}`;
		const publishedAt = Date.parse(published);
		if (!Number.isFinite(publishedAt)) continue;
		const authorRecord = asRecord(entry['author']);
		const event: SocialEvent = {
			platform: 'youtube',
			sourceId: channelId,
			contentId: videoId,
			title,
			url,
			thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
			author: (authorRecord ? firstString(authorRecord['name']) : null) ?? channelId,
			publishedAt
		};
		const parsed = socialEventSchema.safeParse(event);
		if (parsed.success) events.push(parsed.data);
	}
	return { channelId, events };
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function firstString(value: unknown): string | null {
	if (typeof value === 'string' && value.length > 0) return value;
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	return null;
}

/** entry의 <link rel="alternate"> href를 골라요. 여러 link가 와도 watch URL을 우선해요. */
function pickAlternateHref(linkField: unknown): string | null {
	const links = Array.isArray(linkField) ? linkField : [linkField];
	let fallback: string | null = null;
	for (const raw of links) {
		const record = asRecord(raw);
		if (!record) continue;
		const href = firstString(record['@_href']);
		if (!href) continue;
		const rel = firstString(record['@_rel']);
		if (rel === 'alternate') return href;
		if (fallback === null && rel !== 'hub' && rel !== 'self') fallback = href;
	}
	return fallback;
}

/** 채널 페이지 <title> 추출용 최소 엔티티 디코딩: XML 본문은 fast-xml-parser가 디코딩해요. */
function decodeEntities(value: string): string {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');
}
