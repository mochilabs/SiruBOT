/**
 * 임베드 복구 프로바이더 — X(fxtwitter API)·인스타그램(kkinstagram)·BOOTH(OG) 메타데이터.
 *
 * - 네트워크 실패는 그대로 throw(serveCached가 서킷브레이커에 기록)하고,
 *   "존재하지 않는 콘텐츠"(삭제 트윗·게시물·상품)는 null/false로 돌려요 — 회로를 오염시키지 않아요.
 * - fetch 결과를 EmbedFixResult로 매핑하는 부분은 순수 함수로 분리해 테스트 가능해요.
 * - kkinstagram은 메타를 주지 않아서 이미지 리다이렉트 여부만 확인해요 (봇은 갤러리에 kk URL을 심어
 *   Discord가 렌더 시점에 재리다이렉트받아요 — 만료 파라미터(oe=)가 붙는 최종 URL은 캐시하지 않아요).
 */
import {
	type BoothOgMeta,
	type EmbedFixMetadataRequestLink,
	type EmbedFixResult,
	type FxTwitterStatus,
	fxTwitterApiUrl,
	parseBoothOg,
	parseFxTwitterStatus
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
