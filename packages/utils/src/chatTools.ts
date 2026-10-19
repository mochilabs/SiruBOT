/**
 * 채팅 유틸리티 기능의 공용 계약 — 이모지 확대·메시지 인용·임베드 복구·카운팅 채널 (봇·대시보드가 함께 써요).
 *
 * 봇의 general/message 리스너들은 이 모듈의 순수 함수로만 메시지를 판정해요 (DB·Discord API 접근 없음).
 * 대시보드는 EMBED_FIX_SITES·normalizeEmbedFixSites 계약을 그대로 재사용해요.
 * 임베드 복구 프로바이더(kkinstagram 등)는 외부 서비스라 불안정할 수 있어요 — 도메인은 상수로 두고 교체할 수 있게 해요.
 * X 메타데이터는 FxEmbed 공개 API(api.fxtwitter.com)에서 가져와요. data-api /v1/embed-fix/metadata 라우트와
 * 봇 embedFixGateway는 이 모듈의 요청/응답 스키마를 공유해요.
 */
import { z } from 'zod';

// --- 이모지 확대: 커스텀 이모지만으로 구성된 메시지를 큰 이미지로 다시 보여줘요 ---

/** 한 메시지에서 확대할 최대 이모지 수 */
export const EMOJI_ENLARGE_MAX = 10;

/** 커스텀 이모지 토큰 — <a?:name:id> 형식만 인정해요 (유니코드 이모지는 CDN 이미지가 없어 확대 대상이 아니에요) */
const CUSTOM_EMOJI_PATTERN = /^<[a]?:([A-Za-z0-9_~]+):(\d{17,20})>$/u;

export interface EnlargedEmoji {
	id: string;
	name: string;
	animated: boolean;
}

/** 커스텀 이모지만으로 구성된 메시지면 이모지 목록, 아니면 null을 돌려줘요 */
export function parseEmojiOnlyMessage(content: string): EnlargedEmoji[] | null {
	const trimmed = content.trim();
	if (trimmed.length === 0) return null;
	const tokens = trimmed.split(/\s+/u);
	if (tokens.length > EMOJI_ENLARGE_MAX) return null;
	const emojis: EnlargedEmoji[] = [];
	for (const token of tokens) {
		const match = CUSTOM_EMOJI_PATTERN.exec(token);
		if (!match) return null;
		emojis.push({ name: match[1], id: match[2], animated: token.startsWith('<a:') });
	}
	return emojis;
}

/** 커스텀 이모지의 CDN 큰 이미지 주소 */
export function customEmojiUrl(emoji: EnlargedEmoji, size: 128 | 256 | 512 | 1024 = 512): string {
	return `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}?size=${size}&quality=lossless`;
}

// --- 메시지 링크 인용: discord.com/channels/길드/채널/메시지 링크를 자체 인용으로 보여줘요 ---

/** 한 메시지에서 인용할 최대 링크 수 */
export const MESSAGE_LINK_MAX = 3;

export interface MessageLinkTarget {
	guildId: string;
	channelId: string;
	messageId: string;
}

// (?<![\w.-]) — 앞이 글자·점·하이픈이면 매칭하지 않아요 (thetwitter.com 같은 유사 도메인 오탐 방지)
const MESSAGE_LINK_PATTERN =
	/(?<![\w.-])(?:https?:\/\/)?(?:ptb\.|canary\.)?(?:www\.)?discord\.com\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})/gu;

/**
 * 메시지 본문에서 디스코드 메시지 링크를 뽑아요. `<링크>`로 감싼 링크는 임베드/링크 미리보기 자체를
 * 의도적으로 끈 것이므로 건너뛰어요. 중복 링크는 첫 번째만 인정해요.
 */
export function parseMessageLinks(content: string, limit: number = MESSAGE_LINK_MAX): MessageLinkTarget[] {
	const unmasked = content.replace(/<https?:\/\/[^>]+>/gu, ' ');
	const targets: MessageLinkTarget[] = [];
	const seen = new Set<string>();
	for (const match of unmasked.matchAll(MESSAGE_LINK_PATTERN)) {
		if (seen.has(match[3])) continue;
		seen.add(match[3]);
		targets.push({ guildId: match[1], channelId: match[2], messageId: match[3] });
		if (targets.length >= limit) break;
	}
	return targets;
}

// --- 임베드 복구: X·인스타·TikTok·Reddit·Pixiv·Threads는 프로바이더 도메인 스왑, BOOTH는 자체 OG 임베드 ---

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
export const EMBED_FIX_LINK_MAX = 2;

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
	| EmbedFixXLink
	| EmbedFixInstagramLink
	| EmbedFixTikTokLink
	| EmbedFixRedditLink
	| EmbedFixPixivLink
	| EmbedFixThreadsLink;

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

// --- BOOTH 자체 임베드·사이트 카드: OG 메타를 직접 읽어 임베드를 만들어요 ---

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

// --- 임베드 복구 메타데이터 게이트웨이 계약: 봇 → data-api 요청/응답 스키마 ---

/** 게이트웨이 요청 한 번에 담을 수 있는 링크 수 (EMBED_FIX_LINK_MAX 여유분) */
export const EMBED_FIX_METADATA_LINK_MAX = 4;

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
		.max(EMBED_FIX_METADATA_LINK_MAX)
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
	videoUrl: z.string().optional()
});

export const embedFixMetadataResponseSchema = z.object({
	results: z.array(embedFixResultSchema)
});

export type EmbedFixMetadataRequest = z.infer<typeof embedFixMetadataRequestSchema>;
export type EmbedFixResult = z.infer<typeof embedFixResultSchema>;

// --- 카운팅 채널: 지정 채널에서 숫자를 순서대로 세어요 ---

export interface CountingState {
	current: number;
	lastUserId: string | null;
	best: number;
}

export interface CountingAttemptResult {
	/** 이번 시도가 정답(= current + 1)인지 */
	ok: boolean;
	/** 시도 후의 새 상태 */
	state: CountingState;
	/** 진행 중이던 카운트가 초기화됐는지 (이미 0이었으면 false) */
	reset: boolean;
	/** 새 최고 기록인지 */
	newBest: boolean;
}

/** 카운팅 채널 상태의 기본값 */
export const COUNTING_STATE_DEFAULT: CountingState = { current: 0, lastUserId: null, best: 0 };

/** 메시지가 숫자 하나면 그 값, 아니면 null을 돌려줘요 */
export function parseCountingMessage(content: string): number | null {
	const trimmed = content.trim();
	if (trimmed.length === 0 || trimmed.length > 15 || !/^\d+$/u.test(trimmed)) return null;
	return Number(trimmed);
}

/**
 * 카운팅 시도를 판정해요 — 정답은 current + 1이고, 같은 사람이 연속으로 세는 건 막아요 (혼자 도배 방지).
 * 틀리면 0으로 초기화돼요 (reset: true). 판정은 순수하게 유지하고 저장은 봇 서비스가 해요.
 */
export function evaluateCounting(state: CountingState, attempt: number, userId: string): CountingAttemptResult {
	if (attempt === state.current + 1 && state.lastUserId !== userId) {
		const newBest = attempt > state.best;
		return {
			ok: true,
			state: { current: attempt, lastUserId: userId, best: Math.max(state.best, attempt) },
			reset: false,
			newBest
		};
	}
	return {
		ok: false,
		state: { current: 0, lastUserId: null, best: state.best },
		reset: state.current > 0,
		newBest: false
	};
}
