/**
 * Embed fix provider — X (fxtwitter API) · Instagram (kkinstagram) · BOOTH (OG) ·
 * OG card sites (TikTok tnktok · Reddit vxreddit · Pixiv phixiv · Threads fixthreads) metadata.
 *
 * - Network failures throw as-is (serveCached records them in the circuit breaker), and
 *   "non-existent content" (deleted tweets/posts/products) is returned as null/false — it doesn't pollute the circuit.
 * - The part that maps fetch results to EmbedFixResult is separated into pure functions so it's testable.
 * - kkinstagram doesn't provide meta, so we only check whether the link leads to an image redirect (the bot embeds the kk URL in the gallery and
 *   has Discord re-redirect at render time — the final URL with the expiration parameter (oe=) must not be cached).
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

/** 인스타그램 결과 매핑 — 이미지로 이어지면 카드(갤러리에 kk URL), 아니면 kkinstagram 링크 */
export function instagramEmbedFixResult(link: EmbedFixMetadataRequestLink, imageOk: boolean): EmbedFixResult {
	if (!imageOk || !link.fixedUrl) {
		return { site: 'instagram', mode: 'link', ...(link.fixedUrl ? { fixedUrl: link.fixedUrl } : {}) };
	}
	return { site: 'instagram', mode: 'card', images: [link.fixedUrl], sourceUrl: link.url };
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
