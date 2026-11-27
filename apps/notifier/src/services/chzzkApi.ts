import { z } from 'zod';

const CHZZK_LIVE_STATUS_URL = 'https://api.chzzk.naver.com/polling/v2/channels';
const CHZZK_LIVE_DETAIL_URL = 'https://api.chzzk.naver.com/service/v2/channels';
const CHZZK_SERVICE_URL = 'https://api.chzzk.naver.com/service/v1';
const CHZZK_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 8_000;
const LIVE_IMAGE_TYPE = '1080';

export function resolveChzzkLiveImageUrl(template: string | null | undefined): string | null {
	if (!template) return null;
	const resolved = template.replaceAll('{type}', LIVE_IMAGE_TYPE);
	return /^https?:\/\//i.test(resolved) ? resolved : null;
}

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

export class ChzzkApiError extends Error {
	constructor(
		message: string,
		readonly status?: number
	) {
		super(message);
		this.name = 'ChzzkApiError';
	}
}

function chzzkGet(url: string, fetchFn: FetchFn): Promise<Response> {
	return fetchFn(url, {
		headers: { 'User-Agent': CHZZK_USER_AGENT, Accept: 'application/json' },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});
}

export async function fetchChzzkLiveStatus(channelId: string, fetchFn: FetchFn = fetch): Promise<ChzzkLiveStatus> {
	const response = await chzzkGet(`${CHZZK_LIVE_STATUS_URL}/${encodeURIComponent(channelId)}/live-status`, fetchFn);
	if (!response.ok) {
		throw new ChzzkApiError(`chzzk live-status responded ${response.status}`, response.status);
	}
	const parsed = liveStatusResponseSchema.safeParse(await response.json());
	if (!parsed.success) {
		throw new ChzzkApiError('chzzk live-status 응답 형식이 예상과 달라요');
	}
	const content = parsed.data.content;
	const isLive = content?.openLive === true || content?.status === 'OPEN';
	return {
		isLive,
		liveId: content?.liveId != null ? String(content.liveId) : null,
		liveTitle: content?.liveTitle ?? null,
		channelName: content?.channelName ?? null,
		thumbnailUrl: resolveChzzkLiveImageUrl(content?.liveImageUrl)
	};
}

const liveDetailResponseSchema = z.object({
	code: z.number().nullish(),
	content: z
		.object({
			status: z.string().nullish(),
			liveImageUrl: z.string().nullish()
		})
		.nullish()
});

/** polling v2 live-status가 이미지 필드를 주지 않아 뱅온 시점에 live-detail로 보완해요 (실패 시 null). */
export async function fetchChzzkLiveThumbnail(channelId: string, fetchFn: FetchFn = fetch): Promise<string | null> {
	try {
		const response = await chzzkGet(`${CHZZK_LIVE_DETAIL_URL}/${encodeURIComponent(channelId)}/live-detail`, fetchFn);
		if (!response.ok) return null;
		const parsed = liveDetailResponseSchema.safeParse(await response.json());
		if (!parsed.success) return null;
		const content = parsed.data.content;
		if (content?.status != null && content.status !== 'OPEN') return null;
		return resolveChzzkLiveImageUrl(content?.liveImageUrl);
	} catch {
		return null;
	}
}

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

export async function searchChzzkChannels(keyword: string, offset = 0, size = 10, fetchFn: FetchFn = fetch): Promise<ChzzkChannelSummary[]> {
	const response = await chzzkGet(
		`${CHZZK_SERVICE_URL}/search/channels?keyword=${encodeURIComponent(keyword)}&offset=${offset}&size=${size}`,
		fetchFn
	);
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

export async function fetchChzzkChannelProfile(channelId: string, fetchFn: FetchFn = fetch): Promise<ChzzkChannelSummary | null> {
	const response = await chzzkGet(`${CHZZK_SERVICE_URL}/channels/${encodeURIComponent(channelId)}`, fetchFn);
	if (!response.ok) {
		throw new ChzzkApiError(`chzzk profile responded ${response.status}`, response.status);
	}
	const parsed = profileResponseSchema.safeParse(await response.json());
	if (!parsed.success) {
		throw new ChzzkApiError('chzzk profile 응답 형식이 예상과 달라요');
	}
	return normalizeChzzkChannel(parsed.data.content, null);
}
