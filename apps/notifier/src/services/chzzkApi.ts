import { z } from 'zod';

const CHZZK_LIVE_STATUS_URL = 'https://api.chzzk.naver.com/polling/v2/channels';
// 치지직 웹 클라이언트 계열의 User-Agent — 차단 우회가 아니라 브라우저형 요청임을 나타내는 표준 헤더예요.
const CHZZK_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 8_000;
// liveImageUrl은 `{type}` 플레이스홀더 템플릿이라 실제 사이즈로 치환해요.
const LIVE_IMAGE_TYPE = '1080';

// 응답 스펙은 커뮤니티 관찰 기반이라 관대하게 파싱하고, 필드가 없으면 오프라인으로 판정해요 (실측은 한국망 런타임에서 필요).
const liveStatusContentSchema = z.object({
	channelId: z.string().nullish(),
	channelName: z.string().nullish(),
	liveTitle: z.string().nullish(),
	liveImageUrl: z.string().nullish(),
	openLive: z.boolean().nullish(),
	status: z.string().nullish(),
	liveId: z.union([z.string(), z.number()]).nullish(),
	liveDate: z.string().nullish()
});

const liveStatusResponseSchema = z.object({
	code: z.number().nullish(),
	message: z.string().nullish(),
	content: liveStatusContentSchema.nullable()
});

export interface ChzzkLiveStatus {
	isLive: boolean;
	liveId: string | null;
	liveTitle: string | null;
	channelName: string | null;
	thumbnailUrl: string | null;
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** 치지직 API의 HTTP 상태를 담는 에러 — 폴러가 채널 삭제(404)와 시스템 장애를 구분하는 데 써요. */
export class ChzzkApiError extends Error {
	constructor(
		message: string,
		readonly status?: number
	) {
		super(message);
		this.name = 'ChzzkApiError';
	}
}

/** 치지직 채널의 라이브 상태를 조회해요 (비공식 polling v2 — 무인증, 커뮤니티 표준). */
export async function fetchChzzkLiveStatus(channelId: string, fetchFn: FetchFn = fetch): Promise<ChzzkLiveStatus> {
	const response = await fetchFn(`${CHZZK_LIVE_STATUS_URL}/${encodeURIComponent(channelId)}/live-status`, {
		headers: { 'User-Agent': CHZZK_USER_AGENT, Accept: 'application/json' },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});
	if (!response.ok) {
		throw new ChzzkApiError(`chzzk live-status responded ${response.status}`, response.status);
	}
	const parsed = liveStatusResponseSchema.safeParse(await response.json());
	if (!parsed.success) {
		throw new ChzzkApiError('chzzk live-status 응답 형식이 예상과 달라요');
	}
	const content = parsed.data.content;
	// v2는 openLive 기반이지만 일부 응답은 status:'OPEN'을 쓰므로 이중으로 판정해요.
	const isLive = content?.openLive === true || content?.status === 'OPEN';
	return {
		isLive,
		liveId: content?.liveId != null ? String(content.liveId) : null,
		liveTitle: content?.liveTitle ?? null,
		channelName: content?.channelName ?? null,
		thumbnailUrl: content?.liveImageUrl?.replaceAll('{type}', LIVE_IMAGE_TYPE) ?? null
	};
}

// ── 채널 검색·프로필 (대시보드 구독 추가용 — 관리자 수동 검색 시에만 호출돼요) ──

const CHZZK_SERVICE_URL = 'https://api.chzzk.naver.com/service/v1';

const channelSchema = z.object({
	channelId: z.string().nullish(),
	channelName: z.string().nullish(),
	channelImageUrl: z.string().nullish(),
	verifiedMark: z.boolean().nullish(),
	channelType: z.string().nullish(),
	channelDescription: z.string().nullish(),
	followerCount: z.number().nullish(),
	openLive: z.boolean().nullish()
});

const searchItemSchema = z.object({
	channel: channelSchema.nullish(),
	// 라이브 중이면 검색 결과에 live 정보도 실려요 — 카드 미리보기에 제목을 보여주려고 읽어요.
	live: z.object({ liveTitle: z.string().nullish(), liveId: z.union([z.string(), z.number()]).nullish() }).nullish()
});

const searchResponseSchema = z.object({
	code: z.number().nullish(),
	content: z.object({ data: z.array(searchItemSchema).nullish() }).nullish()
});

const profileResponseSchema = z.object({
	code: z.number().nullish(),
	content: channelSchema.nullable()
});

export interface ChzzkChannelSummary {
	channelId: string;
	channelName: string;
	channelImageUrl: string | null;
	verifiedMark: boolean;
	channelDescription: string | null;
	followerCount: number;
	openLive: boolean;
	liveTitle: string | null;
}

function normalizeChzzkChannel(channel: z.infer<typeof channelSchema> | null | undefined, liveTitle: string | null): ChzzkChannelSummary | null {
	if (!channel?.channelId || !channel.channelName) return null;
	return {
		channelId: channel.channelId,
		channelName: channel.channelName,
		channelImageUrl: channel.channelImageUrl ?? null,
		verifiedMark: channel.verifiedMark ?? false,
		channelDescription: channel.channelDescription ?? null,
		followerCount: channel.followerCount ?? 0,
		openLive: channel.openLive ?? false,
		liveTitle
	};
}

/** 치지직 채널을 키워드로 검색해요 (비공식 검색 API — 사이트 자체 검색이 쓰는 엔드포인트, 무인증). */
export async function searchChzzkChannels(keyword: string, offset = 0, size = 10, fetchFn: FetchFn = fetch): Promise<ChzzkChannelSummary[]> {
	const response = await fetchFn(`${CHZZK_SERVICE_URL}/search/channels?keyword=${encodeURIComponent(keyword)}&offset=${offset}&size=${size}`, {
		headers: { 'User-Agent': CHZZK_USER_AGENT, Accept: 'application/json' },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});
	if (!response.ok) {
		throw new ChzzkApiError(`chzzk search responded ${response.status}`, response.status);
	}
	const parsed = searchResponseSchema.safeParse(await response.json());
	if (!parsed.success) {
		throw new ChzzkApiError('chzzk search 응답 형식이 예상과 달라요');
	}
	const summaries: ChzzkChannelSummary[] = [];
	for (const item of parsed.data.content?.data ?? []) {
		const summary = normalizeChzzkChannel(item.channel, item.live?.liveTitle ?? null);
		if (summary) summaries.push(summary);
	}
	return summaries;
}

/** 치지직 채널 프로필을 조회해요 (구독 추가 시 이름·이미지 확인용, 무인증). */
export async function fetchChzzkChannelProfile(channelId: string, fetchFn: FetchFn = fetch): Promise<ChzzkChannelSummary | null> {
	const response = await fetchFn(`${CHZZK_SERVICE_URL}/channels/${encodeURIComponent(channelId)}`, {
		headers: { 'User-Agent': CHZZK_USER_AGENT, Accept: 'application/json' },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});
	if (!response.ok) {
		throw new Error(`chzzk profile responded ${response.status}`);
	}
	const parsed = profileResponseSchema.safeParse(await response.json());
	if (!parsed.success) {
		throw new Error('chzzk profile 응답 형식이 예상과 달라요');
	}
	return normalizeChzzkChannel(parsed.data.content, null);
}
