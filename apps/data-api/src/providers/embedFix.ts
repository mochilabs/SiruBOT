import {
	type BoothOgMeta,
	type EmbedFixActiveTranslateLang,
	type EmbedFixMetadataRequestLink,
	type EmbedFixResult,
	type FxTwitterStatus,
	type OgMeta,
	fxTwitterApiUrl,
	parseBoothOg,
	parseFxTwitterStatus,
	parseOgMeta,
	shouldTranslateEmbedText
} from '@sirubot/utils';
import type { TranslationProvider } from './translate.ts';

const FX_FETCH_TIMEOUT_MS = 10_000;
const INSTAGRAM_FETCH_TIMEOUT_MS = 10_000;
const BOOTH_FETCH_TIMEOUT_MS = 10_000;
// BOOTH and Instagram proxies only return OG tags to Discord crawler UA.
const BOOTH_USER_AGENT = 'Discordbot/2.0';
const KIRKSTAGRAM_DOMAIN = 'kirkstagram.com';
const TOINSTAGRAM_DOMAIN = 'toinstagram.com';

export const EMBED_FIX_TTL_SECONDS = 30 * 60;

export function embedFixCacheKey(site: string, url: string): string {
	return `dataapi:v1:embed-fix:${site}:${url}`;
}

export const EMBED_FIX_TRANSLATE_TTL_SECONDS = 24 * 60 * 60;

export function embedFixTranslateCacheKey(site: string, url: string, lang: EmbedFixActiveTranslateLang): string {
	return `dataapi:v1:embed-fix:tr:${lang}:${site}:${url}`;
}

const TARGET_LANG_NAMES: Record<EmbedFixActiveTranslateLang, string> = {
	ko: '한국어',
	en: '영어(English)',
	ja: '일본어(日本語)'
};

export interface EmbedTranslationFields {
	title?: string;
	description?: string;
}

export function extractTranslatableEmbedFields(result: EmbedFixResult, targetLang: EmbedFixActiveTranslateLang): EmbedTranslationFields | null {
	if (result.mode !== 'card') return null;
	const translateTitle = result.site !== 'instagram' && result.site !== 'x' && shouldTranslateEmbedText(result.title, targetLang);
	const translateDescription = shouldTranslateEmbedText(result.description, targetLang);
	if (!translateTitle && !translateDescription) return null;
	return {
		...(translateTitle && result.title ? { title: result.title } : {}),
		...(translateDescription && result.description ? { description: result.description } : {})
	};
}

export function parseEmbedTranslationResponse(text: string): EmbedTranslationFields | null {
	const stripped = text.replace(/```(?:json)?/giu, '').trim();
	const start = stripped.indexOf('{');
	const end = stripped.lastIndexOf('}');
	if (start === -1 || end <= start) return null;
	try {
		const parsed = JSON.parse(stripped.slice(start, end + 1)) as { title?: unknown; description?: unknown };
		const title = typeof parsed.title === 'string' && parsed.title.trim().length > 0 ? parsed.title.trim() : undefined;
		const description = typeof parsed.description === 'string' && parsed.description.trim().length > 0 ? parsed.description.trim() : undefined;
		if (!title && !description) return null;
		return { ...(title ? { title } : {}), ...(description ? { description } : {}) };
	} catch {
		return null;
	}
}

export async function translateEmbedFixCard(
	result: EmbedFixResult,
	targetLang: EmbedFixActiveTranslateLang,
	provider: TranslationProvider
): Promise<EmbedTranslationFields | null> {
	const fields = extractTranslatableEmbedFields(result, targetLang);
	if (!fields) return null;
	const langLabel = TARGET_LANG_NAMES[targetLang];
	const systemPrompt = [
		`당신은 소셜 미디어 게시물(X, Instagram, BOOTH, Pixiv, Reddit 등)을 자연스러운 ${langLabel}로 번역하는 전문가예요.`,
		'입력은 JSON 객체({"title"?: string, "description"?: string})예요.',
		'규칙:',
		`- 입력에 포함된 키(title, description)만 ${langLabel}로 자연스럽게 번역해요.`,
		'- URL, 해시태그(#), 멘션(@), 고유명사, 줄바꿈 구조는 그대로 유지해요.',
		'- 원문이 이미 목표 언어라면 원문을 그대로 돌려줘요.',
		'- 출력은 {"title":"...","description":"..."} 형태의 JSON 객체 하나만, 설명이나 마크다운 펜스 없이 반환해요.'
	].join('\n');

	const raw = await provider.chatCompletion(systemPrompt, JSON.stringify(fields), 'embed-fix translation');
	const parsed = parseEmbedTranslationResponse(raw);
	if (!parsed) throw new Error('embed-fix translation returned invalid JSON');
	return parsed;
}

export async function fetchFxTwitterStatus(originalUrl: string): Promise<FxTwitterStatus | null> {
	const apiUrl = fxTwitterApiUrl(originalUrl);
	if (!apiUrl) return null;
	const response = await fetch(apiUrl, { signal: AbortSignal.timeout(FX_FETCH_TIMEOUT_MS) });
	if (!response.ok) return null;
	return parseFxTwitterStatus(await response.json().catch(() => null));
}

export async function fetchInstagramImageOk(fixedUrl: string): Promise<boolean> {
	const response = await fetch(fixedUrl, { signal: AbortSignal.timeout(INSTAGRAM_FETCH_TIMEOUT_MS), redirect: 'follow' });
	const contentType = response.headers.get('content-type') ?? '';
	if (response.body) await response.body.cancel().catch(() => undefined);
	return response.ok && contentType.startsWith('image/');
}

export interface InstagramPostMeta {
	author: string | null;
	caption: string | null;
	images: string[];
	videoUrl: string | null;
}

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

export async function fetchKirkstagramMeta(pageUrl: string): Promise<{ author: string | null; media: string[] } | null> {
	const response = await fetch(pageUrl, {
		headers: { 'user-agent': BOOTH_USER_AGENT },
		signal: AbortSignal.timeout(INSTAGRAM_FETCH_TIMEOUT_MS)
	});
	if (!response.ok) return null;
	const html = await response.text();
	const media = parseKirkstagramGallery(html);
	const meta = parseOgMeta(html, pageUrl);
	// kirk's og:image is a grid preview; use component JSON instead.
	const author = meta?.title ?? null;
	if (!author && media.length === 0) return null;
	return { author, media };
}

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
	if (kirkSettled.status === 'rejected' && toigSettled.status === 'rejected') throw kirkSettled.reason;
	if (link.fixedUrl && (await fetchInstagramImageOk(link.fixedUrl))) {
		return { author: null, caption: null, images: [link.fixedUrl], videoUrl: null };
	}
	return null;
}

export async function fetchBoothMeta(url: string): Promise<BoothOgMeta | null> {
	const response = await fetch(url, {
		headers: { 'user-agent': BOOTH_USER_AGENT },
		signal: AbortSignal.timeout(BOOTH_FETCH_TIMEOUT_MS)
	});
	if (!response.ok) return null;
	return parseBoothOg(await response.text(), url);
}

const OG_FETCH_TIMEOUT_MS = 10_000;

export async function fetchOgMeta(url: string): Promise<OgMeta | null> {
	const response = await fetch(url, {
		headers: { 'user-agent': BOOTH_USER_AGENT },
		signal: AbortSignal.timeout(OG_FETCH_TIMEOUT_MS)
	});
	if (!response.ok) return null;
	return parseOgMeta(await response.text(), url);
}

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

export function boothEmbedFixResult(_link: EmbedFixMetadataRequestLink, meta: BoothOgMeta | null): EmbedFixResult {
	if (!meta) return { site: 'booth', mode: 'skip' };
	return { site: 'booth', mode: 'card', title: meta.title, description: meta.description, images: [meta.image], sourceUrl: meta.url };
}

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
