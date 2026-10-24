/**
 * 임베드 복구 계약 — 링크 파싱·프로바이더 도메인 스왑·게이트웨이 요청/응답 스키마 (봇·data-api·대시보드가 함께 써요).
 *
 * X·인스타·TikTok·Reddit·Pixiv·Threads는 프로바이더 도메인 스왑, BOOTH는 자체 OG 임베드예요.
 * 임베드 복구 프로바이더(kkinstagram 등)는 외부 서비스라 불안정할 수 있어요 — 도메인은 상수로 두고 교체할 수 있게 해요.
 * data-api /v1/embed-fix/metadata 라우트와 봇 embedFixGateway는 이 모듈의 요청/응답 스키마를 그대로 공유해요.
 */
import { z } from 'zod';

export const EMBED_FIX_SITES = ['x', 'instagram', 'booth', 'tiktok', 'reddit', 'pixiv', 'threads'] as const;
export type EmbedFixSite = (typeof EMBED_FIX_SITES)[number];

export const embedFixSiteSchema = z.enum(EMBED_FIX_SITES, '지원하는 임베드 복구 사이트를 선택해 주세요.');

/** 대시보드 저장값 계약 — 스키마는 lib/schemas.ts가 이 상수로 만들어요 */
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

/** 대시보드·봇 저장값 정규화 — 알 수 없는 값은 'off'(번역 안 함)로 되돌려요 */
export function normalizeEmbedFixTranslateLang(value: string | null | undefined): EmbedFixTranslateLang {
	if (typeof value === 'string' && (EMBED_FIX_TRANSLATE_LANGS as readonly string[]).includes(value)) {
		return value as EmbedFixTranslateLang;
	}
	return 'off';
}

/**
 * 임베드 텍스트가 목표 언어로 번역이 필요한지 판정해요.
 * - 링크·멘션·숫자·이모지를 제외한 실제 문자(\p{L})가 2자 미만이면 번역하지 않아요.
 * - 이미 목표 언어 비중이 충분하면(예: ko 설정인데 한글 비중 40% 이상이고 일본어 가나가 없는 경우) LLM 호출을 건너뛰어요.
 */
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
		// 이미 한글 비중이 40% 이상이고 일본어 가나가 없으면 한국어 게시글로 보고 번역하지 않아요
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

/**
 * 임베드 복구 프로바이더 도메인 — 외부 서비스가 죽으면 이 상수만 교체하면 돼요.
 * - twitter.com → fxtwitter.com (FxEmbed)
 * - x.com → fixupx.com (FxEmbed, x.com 전용)
 * - instagram.com → kkinstagram.com (KKInstagram)
 * - tiktok.com → tnktok.com (fxTikTok)
 * - reddit.com → vxreddit.com (vxReddit)
 * - pixiv.net → www.phixiv.net (Phixiv)
 * - threads.net/threads.com → fixthreads.seria.moe (FixThreads 포크, Embed Fixer 봇이 쓰는 인스턴스)
 */
export const X_TWITTER_FIX_DOMAIN = 'fxtwitter.com';
export const X_FIX_DOMAIN = 'fixupx.com';
export const INSTAGRAM_FIX_DOMAIN = 'kkinstagram.com';
export const TIKTOK_FIX_DOMAIN = 'tnktok.com';
export const REDDIT_FIX_DOMAIN = 'vxreddit.com';
export const PIXIV_FIX_DOMAIN = 'www.phixiv.net';
export const THREADS_FIX_DOMAIN = 'fixthreads.seria.moe';

/** 한 메시지에서 복구할 최대 링크 수 */
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

/** 도메인 스왑으로 고칠 수 있는 사이트 (BOOTH는 제외) */
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

/** URL 끝에 붙은 문장 부호를 떼어요 — 괄호로 감싼 링크의 `)`까지 주소로 인식하는 걸 막아요 */
function trimTrailingPunctuation(url: string): string {
	return url.replace(/[)\]}.,;:!?'"…>]+$/u, '');
}

/** 정규식 매칭 결과에 스킴이 없으면 https://를 붙여요 */
function normalizeMatchedUrl(matched: string): string {
	return trimTrailingPunctuation(/^https?:\/\//iu.test(matched) ? matched : `https://${matched}`);
}

/** 감싼 링크(<https://...>)는 미리보기 끄기 의도라 복구하지 않아요 */
function unmaskWrappedLinks(content: string): string {
	return content.replace(/<https?:\/\/[^>]+>/gu, ' ');
}

/** 사이트별 링크 규칙 — 정규식 매칭과 고친 주소 빌드를 한 곳에서 관리해요 */
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

/** 메시지 본문에서 임베드를 복구할 링크를 뽑아요. 사이트별 도메인 스왑/자체 임베드를 결정해요 */
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

/**
 * 원본 URL을 고친 주소로 다시 계산해요 — data-api가 클라이언트가 보낸 fixedUrl을 그대로 믿지 않을 때 써요.
 * 패턴이 안 맞거나 BOOTH면 null을 돌려줘요.
 */
export function swapEmbedFixUrl(site: EmbedFixSite, original: string): string | null {
	if (site === 'booth') return null;
	const rule = EMBED_FIX_URL_RULES[site];
	const match = original.match(new RegExp(rule.pattern.source, 'u'));
	return match ? rule.fixed(match) : null;
}

// 임베드 복구 메타데이터 게이트웨이 계약, 봇 → data-api 요청/응답 스키마

/** 게이트웨이 요청 한 번에 담을 수 있는 링크 수 (EMBED_FIX_LINK_MAX 여유분) */
const EMBED_FIX_METADATA_LINK_MAX = 4;

export interface EmbedFixMetadataRequestLink {
	site: EmbedFixSite;
	/** 원본 링크 */
	url: string;
	/** 프로바이더가 정한 고친 링크 — x·instagram만 있어요 */
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

/**
 * 링크 하나의 복구 결과 — mode가 정하는 3갈래:
 * - card: 메타데이터로 자체 Components V2 임베드를 만들어요 (title·description·images·author…)
 * - link: 프로바이더 고친 링크(fixedUrl)만 다시 보내 Discord가 unfurl하게 해요
 * - skip: 복구할 게 없어요 (비공개·삭제 게시물 등)
 */
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
