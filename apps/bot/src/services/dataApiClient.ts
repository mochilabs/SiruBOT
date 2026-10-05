import { container } from '@sapphire/framework';
import type { DailyHoroscope } from '../modules/games/utils/ohaasaService.ts';
import type { DeliveryTrackResult } from '../modules/general/utils/deliveryService.ts';
import type { WeatherResult, WeatherScope } from '../modules/general/utils/weatherService.ts';

export type { WeatherResult, WeatherScope } from '../modules/general/utils/weatherService.ts';
export { WeatherError } from '../modules/general/utils/weatherService.ts';
export { DeliveryError } from '../modules/general/utils/deliveryService.ts';
export type { DeliveryTrackResult } from '../modules/general/utils/deliveryService.ts';

/** 게이트웨이 4xx 본문 — { error, message } 형태 (도메인 에러). 명령어에서 UserError로 변환해요. */
export class GatewayDomainError extends Error {
	public constructor(
		public readonly identifier: string,
		message: string
	) {
		super(message);
		this.name = 'GatewayDomainError';
	}
}

export interface LyricsResult {
	trackName: string;
	artistName: string;
	plainLyrics: string | null;
	syncedLyrics: string | null;
}

export interface YouTubeChapter {
	name: string;
	start: number;
	end: number;
	duration: number;
}

const GATEWAY_TIMEOUT_MS = 10_000;

function gatewayBaseUrl(): string | null {
	const raw = (process.env.DATA_API_URL ?? '').trim().replace(/\/+$/, '');
	return raw || null;
}

function gatewayHeaders(authKey: string | undefined): Record<string, string> {
	return authKey ? { authorization: authKey } : {};
}

/** data-api GET. 실패/미설정 시 throw. 4xx 도메인 에러는 GatewayDomainError로 변환해요. */
async function gatewayGet<T>(path: string): Promise<T> {
	const base = gatewayBaseUrl();
	if (!base) throw new Error('data-api disabled');
	const res = await fetch(`${base}${path}`, {
		headers: gatewayHeaders((process.env.DATA_API_AUTH_KEY ?? process.env.AUTH_KEY ?? '').trim() || undefined),
		signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS)
	});
	if (!res.ok) {
		let identifier = `data_api_${res.status}`;
		let message = `data-api ${res.status}`;
		try {
			const body = (await res.json()) as { error?: unknown; message?: unknown };
			if (typeof body.error === 'string') identifier = body.error;
			if (typeof body.message === 'string') message = body.message;
		} catch {
			// 본문 파싱 실패 시 기본 메시지
		}
		throw new GatewayDomainError(identifier, message);
	}
	return (await res.json()) as T;
}

/** 오하아사 — 게이트웨이. */
export async function fetchOhaasaKo(): Promise<DailyHoroscope> {
	return gatewayGet<DailyHoroscope>('/v1/ohaasa');
}

/** 가사 검색 — 게이트웨이 (30일 캐시). */
export async function searchLyrics(query: string): Promise<LyricsResult[]> {
	const q = query.replace(/\(.*?\)|\[.*?\]/g, '').trim();
	const data = await gatewayGet<LyricsResult | LyricsResult[]>(`/v1/lyrics?q=${encodeURIComponent(q)}`);
	const results = Array.isArray(data) ? data : [data];
	if (!results?.length || !results[0]?.trackName) throw new Error('lyrics not found');
	return results;
}

/** 유튜브 챕터 — 게이트웨이 (12시간 캐시). */
export async function fetchYouTubeChapters(videoId: string, durationMs: number): Promise<YouTubeChapter[]> {
	if (!videoId || durationMs <= 0) return [];
	const data = await gatewayGet<{ chapters: YouTubeChapter[] }>(`/v1/chapters?videoId=${encodeURIComponent(videoId)}&durationMs=${durationMs}`);
	if (!Array.isArray(data.chapters)) throw new Error('invalid chapters response');
	return data.chapters;
}

/** 택배 조회 — 게이트웨이 (5분 캐시). 별칭 해석도 서버에서 해요. */
export async function trackDelivery(carrierHint: string, trackingNumber: string): Promise<DeliveryTrackResult> {
	return gatewayGet<DeliveryTrackResult>(
		`/v1/delivery/track?carrier=${encodeURIComponent(carrierHint)}&number=${encodeURIComponent(trackingNumber)}`
	);
}

/** 날씨 — 게이트웨이 (15분 캐시). */
export async function fetchWeather(location: string, scope: WeatherScope = 'now'): Promise<WeatherResult> {
	return gatewayGet<WeatherResult>(`/v1/weather?location=${encodeURIComponent(location)}&scope=${scope}`);
}

/**
 * 프로필 카드 이미지 데이터 — data-api POST 바디와 동일한 형식이에요.
 */
export interface ProfileCardRequest {
	userId: string;
	displayName: string;
	username: string;
	avatarUrl: string | null;
	bannerUrl: string | null;
	zodiacCode: string | null;
	zodiacKo: string;
	zodiacJp?: string | null;
	birthMonth: number | null;
	birthDay: number | null;
	playlistCount: number;
	requestedCount: number;
	listenText: string;
	accountCreated: string | null;
	guildJoinedAt: string | null;
}

/**
 * 프로필 카드 PNG 렌더. 실패/미설정 시 null (호출자가 텍스트 카드로 폴백해요).
 */
export async function renderProfileCard(data: ProfileCardRequest): Promise<Buffer | null> {
	const base = gatewayBaseUrl();
	if (!base) return null;
	const authKey = (process.env.DATA_API_AUTH_KEY ?? process.env.AUTH_KEY ?? '').trim();
	try {
		const res = await fetch(`${base}/v1/image/profile`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(authKey ? { authorization: authKey } : {}) },
			body: JSON.stringify(data),
			signal: AbortSignal.timeout(20_000)
		});
		if (!res.ok) throw new Error(`data-api ${res.status}`);
		const type = res.headers.get('content-type') ?? '';
		if (!type.startsWith('image/')) throw new Error(`unexpected content-type: ${type}`);
		return Buffer.from(await res.arrayBuffer());
	} catch (error) {
		container.logger.warn(`[data-api] profile-card failed: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}
