/**
 * 외부 콘텐츠 메타데이터 파싱 — 페이지 OG 메타(BOOTH 자체 임베드·OG 카드 사이트)와 FxEmbed API 트윗 메타데이터.
 *
 * BOOTH는 OG 메타를 직접 읽어 임베드를 만들어요. X 메타데이터는 FxEmbed 공개 API(api.fxtwitter.com)에서
 * 가져와 data-api /v1/embed-fix/metadata와 봇 embedFixGateway가 함께 써요.
 */

export interface BoothOgMeta {
	title: string;
	description: string;
	image: string;
	url: string;
}

/** 일반 OG 메타 — image·video는 사이트마다 있을 수도, 없을 수도 있어요 */
export interface OgMeta {
	title: string;
	description: string;
	image: string | null;
	video: string | null;
	url: string;
}

/** 임베드 설명 최대 길이 */
export const EMBED_FIX_MAX_DESCRIPTION = 350;

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-fA-F]+);/gu, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
		.replace(/&quot;/gu, '"')
		.replace(/&apos;/gu, "'")
		.replace(/&lt;/gu, '<')
		.replace(/&gt;/gu, '>')
		.replace(/&amp;/gu, '&');
}

function readAttribute(tag: string, name: string): string | null {
	const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'iu'));
	return match ? match[1] : null;
}

/** 상대경로면 pageUrl 기준으로 절대경로를 만들고, 이미 절대경로면 그대로 돌려줘요 */
export function absolutizeUrl(value: string, pageUrl: string): string {
	try {
		return new URL(value, pageUrl).href;
	} catch {
		return value;
	}
}

/** pximg 리사이즈 세그먼트(/c/620x620/)를 떼면 원본 해상도가 돼요 */
export function enlargeBoothImage(url: string): string {
	return url.replace(/\/c\/\d+x\d+\//u, '/');
}

/**
 * 페이지의 OG 메타를 파싱해요. title(og:title, 없으면 twitter:title)이 없으면 null을 돌려줘요.
 * description은 EMBED_FIX_MAX_DESCRIPTION자로 잘라요.
 * image·video는 상대경로면 pageUrl 기준으로 절대경로로 바꿔요.
 */
export function parseOgMeta(html: string, pageUrl: string): OgMeta | null {
	const og = new Map<string, string>();
	for (const tagMatch of html.matchAll(/<meta\b[^>]*>/giu)) {
		const tag = tagMatch[0];
		const key = readAttribute(tag, 'property') ?? readAttribute(tag, 'name');
		const content = readAttribute(tag, 'content');
		if (key && content !== null) og.set(key.toLowerCase(), decodeHtmlEntities(content));
	}
	const title = og.get('og:title') ?? og.get('twitter:title');
	if (!title) return null;
	const description = og.get('og:description') ?? og.get('twitter:description') ?? '';
	const image = og.get('og:image') ?? og.get('og:image:secure_url') ?? og.get('twitter:image');
	const video = og.get('og:video') ?? og.get('og:video:secure_url') ?? og.get('twitter:player:stream');
	return {
		title,
		description: description.length > EMBED_FIX_MAX_DESCRIPTION ? `${description.slice(0, EMBED_FIX_MAX_DESCRIPTION - 1)}…` : description,
		image: image ? absolutizeUrl(image, pageUrl) : null,
		video: video ? absolutizeUrl(video, pageUrl) : null,
		url: og.get('og:url') ?? pageUrl
	};
}

/**
 * BOOTH 상품 페이지의 OG 메타를 파싱해요. title·image가 없으면 null을 돌려줘요.
 * image는 원본 해상도로 바꿔요.
 */
export function parseBoothOg(html: string, pageUrl: string): BoothOgMeta | null {
	const meta = parseOgMeta(html, pageUrl);
	if (!meta || !meta.image) return null;
	return { title: meta.title, description: meta.description, image: enlargeBoothImage(meta.image), url: meta.url };
}

// --- X(Twitter) 메타데이터: FxEmbed API 페이징을 봇이 쓰기 좋은 형태로 정리해요 ---

export interface FxTwitterStatus {
	url: string;
	text: string;
	authorName: string;
	authorHandle: string;
	authorAvatar: string;
	/** 정적 사진(name=large 정규화) — 동영상·GIF 트윗은 카드 대신 링크 모드로 넘겨요 */
	photos: string[];
	hasVideo: boolean;
	hasPoll: boolean;
	hasQuote: boolean;
	replyCount: number;
	retweetCount: number;
	likeCount: number;
	/** 유닉스 초 */
	createdAt: number;
}

/** twitter.com/x.com 링크를 FxEmbed API 주소로 바꿔요 (경로 유지). X 링크가 아니면 null */
export function fxTwitterApiUrl(original: string): string | null {
	const replaced = original.replace(/^(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\//iu, 'https://api.fxtwitter.com/');
	return replaced === original && !/^https:\/\/api\.fxtwitter\.com\//iu.test(replaced) ? null : replaced;
}

/** pbs.twimg.com 사진 파라미터를 name=large로 정규화해요 */
export function enlargeTwitterPhoto(url: string): string {
	return url.replace(/([?&])name=\w+/u, '$1name=large');
}

/** 트위터 프로필 아바타(_normal·_bigger·_mini·_200x200)를 400x400으로 키워요 */
export function enlargeTwitterAvatar(url: string): string {
	return url.replace(/_(?:normal|bigger|mini|200x200)\./u, '_400x400.');
}

function toCount(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * FxEmbed API(v1·v2) 응답 payload를 파싱해요 — v1은 `tweet`, v2는 `status` 래퍼를 쓰고
 * 리포스트 수 필드도 `retweets`/`reposts`로 갈렵니다, 둘 다 받아들여요.
 * code가 200이 아니거나 트윗 본문이 없으면(삭제·비공개) null을 돌려줘요.
 */
export function parseFxTwitterStatus(payload: unknown): FxTwitterStatus | null {
	if (typeof payload !== 'object' || payload === null) return null;
	const root = payload as Record<string, unknown>;
	if (root.code !== 200) return null;
	const tweet = (root.tweet ?? root.status) as Record<string, unknown> | undefined;
	if (typeof tweet !== 'object' || tweet === null) return null;
	const author = tweet.author as Record<string, unknown> | undefined;
	const media = tweet.media as Record<string, unknown> | undefined;
	const photos: string[] = [];
	if (typeof media === 'object' && media !== null && Array.isArray(media.photos)) {
		for (const photo of media.photos) {
			if (typeof photo !== 'object' || photo === null) continue;
			const entry = photo as Record<string, unknown>;
			if (entry.type !== 'photo' || typeof entry.url !== 'string' || !/^https?:\/\//iu.test(entry.url)) continue;
			photos.push(enlargeTwitterPhoto(entry.url));
		}
	}
	const videos = typeof media === 'object' && media !== null && Array.isArray(media.videos) ? media.videos.length : 0;
	return {
		url: typeof tweet.url === 'string' ? tweet.url : '',
		text: typeof tweet.text === 'string' ? tweet.text : '',
		authorName: typeof author?.name === 'string' ? author.name : '',
		authorHandle: typeof author?.screen_name === 'string' ? author.screen_name : '',
		authorAvatar: typeof author?.avatar_url === 'string' ? enlargeTwitterAvatar(author.avatar_url) : '',
		photos,
		hasVideo: videos > 0 || (typeof media === 'object' && media !== null && media.external !== undefined),
		hasPoll: typeof tweet.poll === 'object' && tweet.poll !== null,
		hasQuote: typeof tweet.quote === 'object' && tweet.quote !== null,
		replyCount: toCount(tweet.replies),
		retweetCount: toCount(tweet.retweets ?? tweet.reposts),
		likeCount: toCount(tweet.likes),
		createdAt: toCount(tweet.created_timestamp)
	};
}
