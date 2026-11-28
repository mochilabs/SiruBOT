import { z } from 'zod';

export const EMBED_FIX_SITES = ['x', 'instagram', 'booth', 'tiktok', 'reddit', 'pixiv', 'threads'] as const;
export type EmbedFixSite = (typeof EMBED_FIX_SITES)[number];

export const embedFixSiteSchema = z.enum(EMBED_FIX_SITES, '지원하는 임베드 복구 사이트를 선택해 주세요.');

export function normalizeEmbedFixSites(sites: readonly string[] | string[] | null | undefined): EmbedFixSite[] {
	if (!Array.isArray(sites)) return [];
	const allowed = new Set<string>(EMBED_FIX_SITES);
	const normalized: EmbedFixSite[] = [];
	for (const site of sites) {
		if (allowed.has(site) && !normalized.includes(site as EmbedFixSite)) normalized.push(site as EmbedFixSite);
	}
	return normalized;
}

export const EMBED_FIX_TRANSLATE_LANGS = ['off', 'ko', 'en', 'ja'] as const;
export type EmbedFixTranslateLang = (typeof EMBED_FIX_TRANSLATE_LANGS)[number];
export type EmbedFixActiveTranslateLang = Exclude<EmbedFixTranslateLang, 'off'>;

export const embedFixTranslateLangSchema = z.enum(EMBED_FIX_TRANSLATE_LANGS, '지원하는 임베드 번역 언어를 선택해 주세요.');

export function normalizeEmbedFixTranslateLang(value: string | null | undefined): EmbedFixTranslateLang {
	if (typeof value === 'string' && (EMBED_FIX_TRANSLATE_LANGS as readonly string[]).includes(value)) {
		return value as EmbedFixTranslateLang;
	}
	return 'off';
}

export function shouldTranslateEmbedText(text: string | null | undefined, targetLang: EmbedFixTranslateLang): boolean {
	if (!text || targetLang === 'off') return false;
	const cleaned = text
		.replace(/https?:\/\/\S+/gu, ' ')
		.replace(/@[\w.]+/gu, ' ')
		.replace(/#([^\s#]+)/gu, '$1');
	const letters = [...cleaned.matchAll(/\p{L}/gu)].map((match) => match[0]);
	if (letters.length < 2) return false;

	let hangul = 0;
	let kana = 0;
	let han = 0;
	let latin = 0;
	for (const ch of letters) {
		if (/[\uAC00-\uD7A3\u3131-\u318E]/u.test(ch)) hangul++;
		else if (/[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\uFF66-\uFF9F]/u.test(ch)) kana++;
		else if (/[\u4E00-\u9FFF\u3400-\u4DBF]/u.test(ch)) han++;
		else if (/[A-Za-z\u00C0-\u024F]/u.test(ch)) latin++;
	}

	const total = letters.length;
	if (targetLang === 'ko') {
		if (hangul / total >= 0.4 && kana === 0) return false;
		return true;
	}
	if (targetLang === 'ja') {
		if ((kana + han) / total >= 0.4 && hangul === 0 && (kana > 0 || latin / total < 0.3)) return false;
		return true;
	}
	if (targetLang === 'en') {
		if (latin / total >= 0.7 && hangul === 0 && kana === 0 && han === 0) return false;
		return true;
	}
	return false;
}

export const X_TWITTER_FIX_DOMAIN = 'fxtwitter.com';
export const X_FIX_DOMAIN = 'fixupx.com';
export const INSTAGRAM_FIX_DOMAIN = 'kkinstagram.com';
export const TIKTOK_FIX_DOMAIN = 'tnktok.com';
export const REDDIT_FIX_DOMAIN = 'vxreddit.com';
export const PIXIV_FIX_DOMAIN = 'www.phixiv.net';
export const THREADS_FIX_DOMAIN = 'fixthreads.seria.moe';

const EMBED_FIX_LINK_MAX = 2;

export interface EmbedFixXLink {
	site: 'x';
	original: string;
	fixed: string;
}

export interface EmbedFixInstagramLink {
	site: 'instagram';
	original: string;
	fixed: string;
}

export interface EmbedFixTikTokLink {
	site: 'tiktok';
	original: string;
	fixed: string;
}

export interface EmbedFixRedditLink {
	site: 'reddit';
	original: string;
	fixed: string;
}

export interface EmbedFixPixivLink {
	site: 'pixiv';
	original: string;
	fixed: string;
}

export interface EmbedFixThreadsLink {
	site: 'threads';
	original: string;
	fixed: string;
}

export interface EmbedFixBoothLink {
	site: 'booth';
	original: string;
}

export type EmbedFixSwapLink =
	EmbedFixXLink | EmbedFixInstagramLink | EmbedFixTikTokLink | EmbedFixRedditLink | EmbedFixPixivLink | EmbedFixThreadsLink;

export type EmbedFixLink = EmbedFixSwapLink | EmbedFixBoothLink;

const X_LINK_PATTERN =
	/(?<![\w.-])(?:https?:\/\/)?(?:www\.)?(twitter|x)\.com\/([A-Za-z0-9_]{1,20})\/status(?:es)?\/(\d{3,25})(\/(?:photo|video)\/\d+)?/gu;
const INSTAGRAM_LINK_PATTERN = /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,64})/gu;
const BOOTH_LINK_PATTERN = /(?<![\w.-])(?:https?:\/\/)?(?:[A-Za-z0-9-]+\.)*booth\.pm\/(?:ko\/|ja\/|en\/)?items\/(\d+)(\/[A-Za-z0-9_-]+)?/gu;
const TIKTOK_LINK_PATTERN = /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?tiktok\.com\/(@[A-Za-z0-9_.]{1,24}\/(?:video|photo)\/\d{5,25})/gu;
const REDDIT_LINK_PATTERN =
	/(?<![\w.-])(?:https?:\/\/)?(?:(?:www|old|np)\.)?reddit\.com\/(r\/[A-Za-z0-9][A-Za-z0-9_]{1,24}\/comments\/[a-z0-9]{3,12}(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)?)/gu;
const PIXIV_LINK_PATTERN = /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?pixiv\.net\/((?:[a-z]{2}\/)?artworks\/\d{2,20})/gu;
const THREADS_LINK_PATTERN =
	/(?<![\w.-])(?:https?:\/\/)?(?:www\.)?threads\.(?:net|com)\/((?:@[A-Za-z0-9_.]{1,30}\/post\/[A-Za-z0-9_-]{5,40})|(?:t\/[A-Za-z0-9_-]{5,40}))/gu;

function trimTrailingPunctuation(url: string): string {
	return url.replace(/[)\]}.,;:!?'"…>]+$/u, '');
}

function normalizeMatchedUrl(matched: string): string {
	return trimTrailingPunctuation(/^https?:\/\//iu.test(matched) ? matched : `https://${matched}`);
}

function unmaskWrappedLinks(content: string): string {
	return content.replace(/<https?:\/\/[^>]+>/gu, ' ');
}

interface EmbedFixUrlRule {
	pattern: RegExp;
	original: (match: RegExpMatchArray) => string;
	fixed: (match: RegExpMatchArray) => string;
}

const EMBED_FIX_URL_RULES: Record<Exclude<EmbedFixSite, 'booth'>, EmbedFixUrlRule> = {
	x: {
		pattern: X_LINK_PATTERN,
		original: (match) => normalizeMatchedUrl(match[0]),
		fixed: (match) => `https://${match[1] === 'twitter' ? X_TWITTER_FIX_DOMAIN : X_FIX_DOMAIN}/${match[2]}/status/${match[3]}${match[4] ?? ''}`
	},
	instagram: {
		pattern: INSTAGRAM_LINK_PATTERN,
		original: (match) => `${normalizeMatchedUrl(match[0])}/`,
		fixed: (match) => `https://${INSTAGRAM_FIX_DOMAIN}/${match[1]}/${match[2]}/`
	},
	tiktok: {
		pattern: TIKTOK_LINK_PATTERN,
		original: (match) => normalizeMatchedUrl(match[0]),
		fixed: (match) => `https://${TIKTOK_FIX_DOMAIN}/${match[1]}`
	},
	reddit: {
		pattern: REDDIT_LINK_PATTERN,
		original: (match) => normalizeMatchedUrl(match[0]),
		fixed: (match) => `https://${REDDIT_FIX_DOMAIN}/${match[1]}/`
	},
	pixiv: {
		pattern: PIXIV_LINK_PATTERN,
		original: (match) => normalizeMatchedUrl(match[0]),
		fixed: (match) => `https://${PIXIV_FIX_DOMAIN}/${match[1]}`
	},
	threads: {
		pattern: THREADS_LINK_PATTERN,
		original: (match) => normalizeMatchedUrl(match[0]),
		fixed: (match) => `https://${THREADS_FIX_DOMAIN}/${match[1]}`
	}
};

export function findEmbedFixLinks(content: string, sites: readonly EmbedFixSite[]): EmbedFixLink[] {
	const unmasked = unmaskWrappedLinks(content);
	const found: EmbedFixLink[] = [];
	const seen = new Set<string>();
	const push = (link: EmbedFixLink): void => {
		const key = `${link.site}:${link.original}`;
		if (seen.has(key)) return;
		seen.add(key);
		found.push(link);
	};
	for (const site of EMBED_FIX_SITES) {
		if (site === 'booth' || !sites.includes(site)) continue;
		const rule = EMBED_FIX_URL_RULES[site];
		for (const match of unmasked.matchAll(rule.pattern)) {
			push({ site, original: rule.original(match), fixed: rule.fixed(match) } as EmbedFixSwapLink);
		}
	}
	if (sites.includes('booth')) {
		for (const match of unmasked.matchAll(BOOTH_LINK_PATTERN)) {
			push({ site: 'booth', original: normalizeMatchedUrl(match[0]) });
		}
	}
	return found.slice(0, EMBED_FIX_LINK_MAX);
}

export function swapEmbedFixUrl(site: EmbedFixSite, original: string): string | null {
	if (site === 'booth') return null;
	const rule = EMBED_FIX_URL_RULES[site];
	const match = original.match(new RegExp(rule.pattern.source, 'u'));
	return match ? rule.fixed(match) : null;
}

const EMBED_FIX_METADATA_LINK_MAX = 4;

export interface EmbedFixMetadataRequestLink {
	site: EmbedFixSite;
	url: string;
	fixedUrl?: string;
}

export const embedFixMetadataRequestSchema = z.object({
	links: z
		.array(
			z.object({
				site: embedFixSiteSchema,
				url: z.string().url(),
				fixedUrl: z.string().url().optional()
			})
		)
		.min(1)
		.max(EMBED_FIX_METADATA_LINK_MAX),
	translateTo: embedFixTranslateLangSchema.optional()
});

export const embedFixResultSchema = z.object({
	site: embedFixSiteSchema,
	mode: z.enum(['card', 'link', 'skip']),
	title: z.string().optional(),
	description: z.string().optional(),
	authorName: z.string().optional(),
	authorHandle: z.string().optional(),
	authorAvatar: z.string().optional(),
	images: z.array(z.string()).optional(),
	replyCount: z.number().optional(),
	retweetCount: z.number().optional(),
	likeCount: z.number().optional(),
	createdAt: z.number().optional(),
	sourceUrl: z.string().optional(),
	fixedUrl: z.string().optional(),
	videoUrl: z.string().optional(),
	translatedTitle: z.string().optional(),
	translatedDescription: z.string().optional(),
	translatedTo: embedFixTranslateLangSchema.optional()
});

export const embedFixMetadataResponseSchema = z.object({
	results: z.array(embedFixResultSchema)
});

export type EmbedFixMetadataRequest = z.infer<typeof embedFixMetadataRequestSchema>;
export type EmbedFixResult = z.infer<typeof embedFixResultSchema>;
