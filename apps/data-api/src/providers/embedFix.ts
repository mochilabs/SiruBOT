/**
 * Embed fix provider — X (fxtwitter API) · Instagram (kirkstagram + toinstagram + kkinstagram fallback) · BOOTH (OG) ·
 * OG card sites (TikTok tnktok · Reddit vxreddit · Pixiv phixiv · Threads fixthreads) metadata.
 *
 * - Network failures throw as-is (serveCached records them in the circuit breaker), and
 *   "non-existent content" (deleted tweets/posts/products) is returned as null/false — it doesn't pollute the circuit.
 * - The part that maps fetch results to EmbedFixResult is separated into pure functions so it's testable.
 * - Instagram: kirkstagram gives the author and the full carousel media list (Discord component embed JSON), and
 *   toinstagram gives the caption. We merge the two, and if both fail we fall back to kkinstagram's image-only card
 *   (the bot embeds the kk URL in the gallery and has Discord re-redirect at render time — the final URL with the
 *   expiration parameter (oe=) must not be cached).
 */
import {
	type BoothOgMeta,
	type EmbedFixMetadataRequestLink,
	type EmbedFixResult,
	type FxTwitterStatus,
	type OgMeta,
	fxTwitterApiUrl,
	parseBoothOg,
	parseFxTwitterStatus,
	parseOgMeta
} from '@sirubot/utils';

const FX_FETCH_TIMEOUT_MS = 10_000;
const INSTAGRAM_FETCH_TIMEOUT_MS = 10_000;
const BOOTH_FETCH_TIMEOUT_MS = 10_000;
/** BOOTH OG 서버는 Discord 봇 UA에만 메타를 내려줘요 */
const BOOTH_USER_AGENT = 'Discordbot/2.0';
/** 인스타 프록시 두 곳은 Discord 크롤러 UA에만 메타를 내려줘요 */
const KIRKSTAGRAM_DOMAIN = 'kirkstagram.com';
const TOINSTAGRAM_DOMAIN = 'toinstagram.com';

/** 채팅 링크 메타데이터 캐시 수명 — 임베드 대상은 잘 안 바뀌니 30분 */
export const EMBED_FIX_TTL_SECONDS = 30 * 60;

export function embedFixCacheKey(site: string, url: string): string {
	return `dataapi:v1:embed-fix:${site}:${url}`;
}

/** X 게시물 메타데이터 — 삭제·비공개 트윗은 null (네트워크 실패와 구분돼요) */
export async function fetchFxTwitterStatus(originalUrl: string): Promise<FxTwitterStatus | null> {
	const apiUrl = fxTwitterApiUrl(originalUrl);
	if (!apiUrl) return null;
	const response = await fetch(apiUrl, { signal: AbortSignal.timeout(FX_FETCH_TIMEOUT_MS) });
	if (!response.ok) return null;
	return parseFxTwitterStatus(await response.json().catch(() => null));
}

/** kkinstagram 링크가 실제 이미지로 이어지는지 — 삭제된 게시물은 이미지가 안 와요 */
export async function fetchInstagramImageOk(fixedUrl: string): Promise<boolean> {
	const response = await fetch(fixedUrl, { signal: AbortSignal.timeout(INSTAGRAM_FETCH_TIMEOUT_MS), redirect: 'follow' });
	const contentType = response.headers.get('content-type') ?? '';
	if (response.body) await response.body.cancel().catch(() => undefined);
	return response.ok && contentType.startsWith('image/');
}

/** 인스타그램 게시물 카드 데이터 — 작성자·캡션·이미지·영상 */
export interface InstagramPostMeta {
	author: string | null;
	caption: string | null;
	images: string[];
	videoUrl: string | null;
}

/** 원본 인스타 URL의 호스트만 프록시 도메인으로 바꿔요 — 경로(/p/, /reel/)는 그대로 */
function instagramProxyUrl(originalUrl: string, domain: string): string | null {
	try {
		const url = new URL(originalUrl);
		url.protocol = 'https:';
		url.host = domain;
		return url.href;
	} catch {
		return null;
	}
}

/**
 * kirkstagram 페이지에 심어둔 Discord component embed JSON에서 미디어 갤러리(type 12)를 꺼내요.
 * 캐러셀 전체가 절대경로 URL로 들어 있어요.
 */
export function parseKirkstagramGallery(html: string): string[] {
	const match = html.match(/<script id="discord:component-embed"[^>]*>([\s\S]*?)<\/script>/u);
	if (!match) return [];
	try {
		const payload = JSON.parse(match[1]) as {
			component?: { components?: Array<{ type?: number; items?: Array<{ media?: { url?: unknown } }> }> };
		};
		return (payload.component?.components ?? [])
			.filter((component) => component.type === 12)
			.flatMap((component) => component.items ?? [])
			.map((item) => item.media?.url)
			.filter((url): url is string => typeof url === 'string' && /^https?:\/\//u.test(url));
	} catch {
		return [];
	}
}

/** kirkstagram 메타 — 작성자(og:title)와 캐러셀 미디어 전체 */
export async function fetchKirkstagramMeta(pageUrl: string): Promise<{ author: string | null; media: string[] } | null> {
	const response = await fetch(pageUrl, {
		headers: { 'user-agent': BOOTH_USER_AGENT },
		signal: AbortSignal.timeout(INSTAGRAM_FETCH_TIMEOUT_MS)
	});
	if (!response.ok) return null;
	const html = await response.text();
	const media = parseKirkstagramGallery(html);
	const meta = parseOgMeta(html, pageUrl);
	// kirk의 og:image는 전체 캐러셀을 합친 grid 이미지라 카드 미디어로 안 써요 (component JSON이 진짜 목록이에요)
	const author = meta?.title ?? null;
	if (!author && media.length === 0) return null;
	return { author, media };
}

/** toinstagram(InstaFix) 메타 — 캡션(og:description)이 여기만 있어요. 미디어는 단일 대표 1개 */
export async function fetchToinstagramMeta(pageUrl: string): Promise<{ author: string | null; caption: string | null; media: string[] } | null> {
	const response = await fetch(pageUrl, {
		headers: { 'user-agent': BOOTH_USER_AGENT },
		signal: AbortSignal.timeout(INSTAGRAM_FETCH_TIMEOUT_MS)
	});
	if (!response.ok) return null;
	const meta = parseOgMeta(await response.text(), pageUrl);
	if (!meta) return null;
	const media = [meta.video, meta.image].filter((url): url is string => Boolean(url));
	if (!meta.title && media.length === 0) return null;
	return { author: meta.title, caption: meta.description || null, media };
}

/** kirk(작성자·캐러셀) + toig(캡션·대표 미디어) 병합 — 둘 다 비면 null */
export function mergeInstagramMeta(
	kirk: { author: string | null; media: string[] } | null,
	toig: { author: string | null; caption: string | null; media: string[] } | null
): InstagramPostMeta | null {
	const media = kirk && kirk.media.length > 0 ? kirk.media : (toig?.media ?? []);
	if (!kirk && !toig) return null;
	const author = kirk?.author ?? toig?.author ?? null;
	const caption = toig?.caption ?? null;
	if (!author && media.length === 0) return null;
	const videoUrl = media.find((url) => url.includes('/videos/')) ?? null;
	return { author, caption, images: media.filter((url) => url !== videoUrl), videoUrl };
}

/**
 * 인스타그램 카드 데이터 — kirk + toig를 병합하고, 둘 다 실패하면 kkinstagram 이미지 폴백.
 * 네트워크 실패는 그대로 던져서(브레이커 기록) 삭제된 게시물은 null로 돌아가요.
 */
export async function fetchInstagramMeta(link: EmbedFixMetadataRequestLink): Promise<InstagramPostMeta | null> {
	const kirkUrl = instagramProxyUrl(link.url, KIRKSTAGRAM_DOMAIN);
	const toigUrl = instagramProxyUrl(link.url, TOINSTAGRAM_DOMAIN);
	const [kirkSettled, toigSettled] = await Promise.allSettled([
		kirkUrl ? fetchKirkstagramMeta(kirkUrl) : Promise.resolve(null),
		toigUrl ? fetchToinstagramMeta(toigUrl) : Promise.resolve(null)
	]);
	const kirk = kirkSettled.status === 'fulfilled' ? kirkSettled.value : null;
	const toig = toigSettled.status === 'fulfilled' ? toigSettled.value : null;
	const merged = mergeInstagramMeta(kirk, toig);
	if (merged) return merged;
	// 둘 다 네트워크 실패면 브레이커에 기록돼요
	if (kirkSettled.status === 'rejected' && toigSettled.status === 'rejected') throw kirkSettled.reason;
	// 콘텐츠가 없거나 한쪽만 실패했으면 kkinstagram 이미지 카드로 폴백해요
	if (link.fixedUrl && (await fetchInstagramImageOk(link.fixedUrl))) {
		return { author: null, caption: null, images: [link.fixedUrl], videoUrl: null };
	}
	return null;
}

/** BOOTH 상품 OG 메타 — 원본 해상도 이미지 파싱은 utils 계약(parseBoothOg)을 따라요 */
export async function fetchBoothMeta(url: string): Promise<BoothOgMeta | null> {
	const response = await fetch(url, {
		headers: { 'user-agent': BOOTH_USER_AGENT },
		signal: AbortSignal.timeout(BOOTH_FETCH_TIMEOUT_MS)
	});
	if (!response.ok) return null;
	return parseBoothOg(await response.text(), url);
}

const OG_FETCH_TIMEOUT_MS = 10_000;

/**
 * 스왑 사이트(TikTok·Reddit·Pixiv·Threads) OG 메타 — 고친 주소에서 메타를 읽어요.
 * 프로바이더들은 Discord 크롤러 UA에만 og 태그를 내려주니 Discordbot UA를 써요.
 */
export async function fetchOgMeta(url: string): Promise<OgMeta | null> {
	const response = await fetch(url, {
		headers: { 'user-agent': BOOTH_USER_AGENT },
		signal: AbortSignal.timeout(OG_FETCH_TIMEOUT_MS)
	});
	if (!response.ok) return null;
	return parseOgMeta(await response.text(), url);
}

/** X 결과 매핑 — 사진·텍스트 트윃은 CV2 카드, 영상·투표·인용은 fxtwitter 링크가 더 나아요 */
export function xEmbedFixResult(link: EmbedFixMetadataRequestLink, status: FxTwitterStatus | null): EmbedFixResult {
	if (!status || status.hasVideo || status.hasPoll || status.hasQuote) {
		return { site: 'x', mode: 'link', ...(link.fixedUrl ? { fixedUrl: link.fixedUrl } : {}) };
	}
	return {
		site: 'x',
		mode: 'card',
		authorName: status.authorName,
		authorHandle: status.authorHandle,
		authorAvatar: status.authorAvatar,
		description: status.text,
		images: status.photos,
		replyCount: status.replyCount,
		retweetCount: status.retweetCount,
		likeCount: status.likeCount,
		createdAt: status.createdAt,
		sourceUrl: link.url
	};
}

/** 인스타그램 결과 매핑 — 메타(작성자·캡션·미디어)가 오면 CV2 카드, 아니면 kkinstagram 링크 */
export function instagramEmbedFixResult(link: EmbedFixMetadataRequestLink, meta: InstagramPostMeta | null): EmbedFixResult {
	if (!meta || (!meta.author && meta.images.length === 0 && !meta.videoUrl)) {
		return { site: 'instagram', mode: 'link', ...(link.fixedUrl ? { fixedUrl: link.fixedUrl } : {}) };
	}
	return {
		site: 'instagram',
		mode: 'card',
		...(meta.author ? { title: meta.author } : {}),
		...(meta.caption ? { description: meta.caption } : {}),
		...(meta.images.length > 0 ? { images: meta.images } : {}),
		...(meta.videoUrl ? { videoUrl: meta.videoUrl } : {}),
		sourceUrl: link.url
	};
}

/** BOOTH 결과 매핑 — 상품이 살아 있으면 카드, 아니면 스킵 (원본 임베드에 맡겨요) */
export function boothEmbedFixResult(_link: EmbedFixMetadataRequestLink, meta: BoothOgMeta | null): EmbedFixResult {
	if (!meta) return { site: 'booth', mode: 'skip' };
	return { site: 'booth', mode: 'card', title: meta.title, description: meta.description, images: [meta.image], sourceUrl: meta.url };
}

/**
 * 스왑 사이트(TikTok·Reddit·Pixiv·Threads) 결과 매핑 — OG 메타가 오면 Components V2 카드,
 * 못 읽으면 고친 링크(fixedUrl)로 폴백해요. 원문 버튼은 원본 주소(sourceUrl)를 써요.
 */
export function ogEmbedFixResult(link: EmbedFixMetadataRequestLink, meta: OgMeta | null, swappedUrl: string | null): EmbedFixResult {
	if (!meta) {
		const fixedUrl = swappedUrl ?? link.fixedUrl;
		return { site: link.site, mode: 'link', ...(fixedUrl ? { fixedUrl } : {}) };
	}
	return {
		site: link.site,
		mode: 'card',
		title: meta.title,
		...(meta.description ? { description: meta.description } : {}),
		...(meta.image ? { images: [meta.image] } : {}),
		...(meta.video ? { videoUrl: meta.video } : {}),
		sourceUrl: link.url
	};
}
