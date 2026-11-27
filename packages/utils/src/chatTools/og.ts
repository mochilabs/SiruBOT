export interface BoothOgMeta {
	title: string;
	description: string;
	image: string;
	url: string;
}

export interface OgMeta {
	title: string;
	description: string;
	image: string | null;
	video: string | null;
	url: string;
}

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

function absolutizeUrl(value: string, pageUrl: string): string {
	try {
		return new URL(value, pageUrl).href;
	} catch {
		return value;
	}
}

export function enlargeBoothImage(url: string): string {
	return url.replace(/\/c\/\d+x\d+\//u, '/');
}

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

export function parseBoothOg(html: string, pageUrl: string): BoothOgMeta | null {
	const meta = parseOgMeta(html, pageUrl);
	if (!meta || !meta.image) return null;
	return { title: meta.title, description: meta.description, image: enlargeBoothImage(meta.image), url: meta.url };
}

export interface FxTwitterStatus {
	url: string;
	text: string;
	authorName: string;
	authorHandle: string;
	authorAvatar: string;
	photos: string[];
	hasVideo: boolean;
	hasPoll: boolean;
	hasQuote: boolean;
	replyCount: number;
	retweetCount: number;
	likeCount: number;
	createdAt: number;
}

export function fxTwitterApiUrl(original: string): string | null {
	const replaced = original.replace(/^(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\//iu, 'https://api.fxtwitter.com/');
	return replaced === original && !/^https:\/\/api\.fxtwitter\.com\//iu.test(replaced) ? null : replaced;
}

export function enlargeTwitterPhoto(url: string): string {
	return url.replace(/([?&])name=\w+/u, '$1name=large');
}

export function enlargeTwitterAvatar(url: string): string {
	return url.replace(/_(?:normal|bigger|mini|200x200)\./u, '_400x400.');
}

function toCount(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

// Handles FxEmbed v1 (tweet/retweets) and v2 (status/reposts) shapes.
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
