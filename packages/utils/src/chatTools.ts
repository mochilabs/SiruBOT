/**
 * 채팅 유틸리티 기능의 공용 계약 — 이모지 확대·메시지 인용·임베드 복구·카운팅 채널 (봇·대시보드가 함께 써요).
 *
 * 봇의 general/message 리스너들은 이 모듈의 순수 함수로만 메시지를 판정해요 (DB·Discord API 접근 없음).
 * 대시보드는 EMBED_FIX_SITES·normalizeEmbedFixSites 계약을 그대로 재사용해요.
 * 임베드 복구 프로바이더(kkinstagram 등)는 외부 서비스라 불안정할 수 있어요 — 도메인은 상수로 두고 교체할 수 있게 해요.
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

// --- 임베드 복구: X·인스타그램은 프로바이더 도메인 스왑, BOOTH는 자체 OG 임베드 ---

export const EMBED_FIX_SITES = ['x', 'instagram', 'booth'] as const;
export type EmbedFixSite = (typeof EMBED_FIX_SITES)[number];

export const embedFixSiteSchema = z.enum(EMBED_FIX_SITES, '지원하는 임베드 복구 사이트를 선택해 주세요.');

/** 대시보드 저장값 계약 — 스키마는 lib/schemas.ts가 이 상수로 만들어요 */
export function normalizeEmbedFixSites(sites: readonly string[] | string[] | null | undefined): EmbedFixSite[] {
	if (!Array.isArray(sites)) return [...EMBED_FIX_SITES];
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
 */
export const X_TWITTER_FIX_DOMAIN = 'fxtwitter.com';
export const X_FIX_DOMAIN = 'fixupx.com';
export const INSTAGRAM_FIX_DOMAIN = 'kkinstagram.com';

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

export interface EmbedFixBoothLink {
	site: 'booth';
	original: string;
}

export type EmbedFixLink = EmbedFixXLink | EmbedFixInstagramLink | EmbedFixBoothLink;

const X_LINK_PATTERN =
	/(?<![\w.-])(?:https?:\/\/)?(?:www\.)?(twitter|x)\.com\/([A-Za-z0-9_]{1,20})\/status(?:es)?\/(\d{3,25})(\/(?:photo|video)\/\d+)?/gu;
const INSTAGRAM_LINK_PATTERN = /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,64})/gu;
const BOOTH_LINK_PATTERN = /(?<![\w.-])(?:https?:\/\/)?(?:[A-Za-z0-9-]+\.)*booth\.pm\/(?:ko\/|ja\/|en\/)?items\/(\d+)(\/[A-Za-z0-9_-]+)?/gu;

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
	if (sites.includes('x')) {
		for (const match of unmasked.matchAll(X_LINK_PATTERN)) {
			const host = match[1] === 'twitter' ? X_TWITTER_FIX_DOMAIN : X_FIX_DOMAIN;
			push({ site: 'x', original: normalizeMatchedUrl(match[0]), fixed: `https://${host}/${match[2]}/status/${match[3]}${match[4] ?? ''}` });
		}
	}
	if (sites.includes('instagram')) {
		for (const match of unmasked.matchAll(INSTAGRAM_LINK_PATTERN)) {
			push({
				site: 'instagram',
				original: `${normalizeMatchedUrl(match[0])}/`,
				fixed: `https://${INSTAGRAM_FIX_DOMAIN}/${match[1]}/${match[2]}/`
			});
		}
	}
	if (sites.includes('booth')) {
		for (const match of unmasked.matchAll(BOOTH_LINK_PATTERN)) {
			push({ site: 'booth', original: normalizeMatchedUrl(match[0]) });
		}
	}
	return found.slice(0, EMBED_FIX_LINK_MAX);
}

// --- BOOTH 자체 임베드: OG 메타를 직접 읽어 큰 이미지 임베드를 만들어요 ---

export interface BoothOgMeta {
	title: string;
	description: string;
	image: string;
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

/** pximg 리사이즈 세그먼트(/c/620x620/)를 떼면 원본 해상도가 돼요 */
export function enlargeBoothImage(url: string): string {
	return url.replace(/\/c\/\d+x\d+\//u, '/');
}

/**
 * BOOTH 상품 페이지의 OG 메타를 파싱해요. title·image가 없으면 null을 돌려줘요.
 * description은 EMBED_FIX_MAX_DESCRIPTION자로 자르고, image는 원본 해상도로 바꿔요.
 */
export function parseBoothOg(html: string, pageUrl: string): BoothOgMeta | null {
	const og = new Map<string, string>();
	for (const tagMatch of html.matchAll(/<meta\b[^>]*>/giu)) {
		const tag = tagMatch[0];
		const property = readAttribute(tag, 'property');
		const content = readAttribute(tag, 'content');
		if (property && content !== null) og.set(property.toLowerCase(), decodeHtmlEntities(content));
	}
	const title = og.get('og:title');
	const image = og.get('og:image');
	if (!title || !image) return null;
	const description = og.get('og:description') ?? '';
	const url = og.get('og:url') ?? pageUrl;
	return {
		title,
		description: description.length > EMBED_FIX_MAX_DESCRIPTION ? `${description.slice(0, EMBED_FIX_MAX_DESCRIPTION - 1)}…` : description,
		image: enlargeBoothImage(image),
		url
	};
}

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
