import type { GreetingConfig, SponsorBlockSkipSegment } from '@sirubot/utils';
import type { GreetingCardKind } from '@sirubot/utils/birthdayCelebration';
import type { DeliveryTrackResult } from '@sirubot/utils/delivery';
import type { DeliveryCarrier } from '@sirubot/utils/delivery';
import type { AirQualityInfo, WeatherResult, WeatherScope } from '@sirubot/utils/weather';
import type { AppLogger } from '../lib/appLogger.ts';
import { dataApiAuthHeaders, gatewayBaseUrl } from '../lib/dataApi.ts';
import type { DailyHoroscope } from './types.ts';

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
	translation?: { status: 'ready' | 'pending' | 'none'; lines: Record<string, string> | null };
}

export interface YouTubeChapter {
	name: string;
	start: number;
	end: number;
	duration: number;
}

const GATEWAY_TIMEOUT_MS = 15_000;
const IMAGE_RENDER_TIMEOUT_MS = 20_000;
// data-api 동시 2개 제한 + 애니메이션 WebP 렌더 대기로 여유를 둬요
const MEMBER_CARD_RENDER_TIMEOUT_MS = 30_000;

export interface RenderedImage {
	buffer: Buffer;
	contentType: string;
}

async function renderImage(logger: AppLogger, path: string, body: unknown): Promise<Buffer | null> {
	return (await renderImageTyped(logger, path, body, IMAGE_RENDER_TIMEOUT_MS))?.buffer ?? null;
}

async function renderImageTyped(logger: AppLogger, path: string, body: unknown, timeoutMs: number): Promise<RenderedImage | null> {
	const base = gatewayBaseUrl();
	if (!base) return null;
	try {
		const res = await fetch(`${base}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...dataApiAuthHeaders() },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs)
		});
		if (!res.ok) throw new Error(`data-api ${res.status}`);
		const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
		if (!type.startsWith('image/')) throw new Error(`unexpected content-type: ${type}`);
		return { buffer: Buffer.from(await res.arrayBuffer()), contentType: type };
	} catch (error) {
		logger.warn(`[data-api] ${path} failed: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

async function gatewayGet<T>(path: string): Promise<T> {
	const base = gatewayBaseUrl();
	if (!base) throw new Error('data-api disabled');
	const res = await fetch(`${base}${path}`, {
		headers: dataApiAuthHeaders(),
		signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS)
	});
	if (!res.ok) {
		let identifier = `data_api_${res.status}`;
		let message = `data-api ${res.status}`;
		try {
			const body = (await res.json()) as { error?: unknown; message?: unknown };
			if (typeof body.error === 'string') identifier = body.error;
			if (typeof body.message === 'string') message = body.message;
		} catch {}
		throw new GatewayDomainError(identifier, message);
	}
	return (await res.json()) as T;
}

export async function fetchOhaasaKo(): Promise<DailyHoroscope> {
	return gatewayGet<DailyHoroscope>('/v1/ohaasa');
}

export async function searchLyrics(query: string): Promise<LyricsResult[]> {
	const q = query.replace(/\(.*?\)|\[.*?\]/g, '').trim();
	const data = await gatewayGet<LyricsResult | LyricsResult[]>(`/v1/lyrics?q=${encodeURIComponent(q)}`);
	const results = Array.isArray(data) ? data : [data];
	if (!results?.length || !results[0]?.trackName) throw new Error('lyrics not found');
	return results;
}

export async function searchLyricsForTrack(track: {
	title: string;
	artist: string;
	durationMs: number;
	sourceName?: string | null;
	videoId?: string | null;
}): Promise<LyricsResult[]> {
	const params = new URLSearchParams({ title: track.title, artist: track.artist, durationMs: String(Math.max(0, Math.round(track.durationMs))) });
	if (track.sourceName) params.set('source', track.sourceName);
	if (track.videoId) params.set('videoId', track.videoId);
	const data = await gatewayGet<LyricsResult>(`/v1/lyrics?${params}`);
	if (!data?.trackName) throw new Error('lyrics not found');
	return [data];
}

export async function fetchYouTubeChapters(videoId: string, durationMs: number): Promise<YouTubeChapter[]> {
	if (!videoId || durationMs <= 0) return [];
	const data = await gatewayGet<{ chapters: YouTubeChapter[] }>(`/v1/chapters?videoId=${encodeURIComponent(videoId)}&durationMs=${durationMs}`);
	if (!Array.isArray(data.chapters)) throw new Error('invalid chapters response');
	return data.chapters;
}

export async function fetchSponsorBlockSegments(videoId: string): Promise<SponsorBlockSkipSegment[]> {
	const data = await gatewayGet<{ segments: SponsorBlockSkipSegment[] }>(`/v1/sponsorblock/segments?videoId=${encodeURIComponent(videoId)}`);
	if (!Array.isArray(data.segments)) throw new Error('invalid SponsorBlock response');
	return data.segments;
}

export async function getSimpleYouTubeSuggestions(query: string, maxResults: number = 10): Promise<string[]> {
	try {
		const data = await gatewayGet<{ suggestions: string[] }>(`/v1/youtube/suggestions?q=${encodeURIComponent(query)}`);
		return Array.isArray(data.suggestions) ? data.suggestions.slice(0, maxResults) : [];
	} catch {
		return [];
	}
}

export async function trackDelivery(carrierHint: string, trackingNumber: string): Promise<DeliveryTrackResult> {
	return gatewayGet<DeliveryTrackResult>(
		`/v1/delivery/track?carrier=${encodeURIComponent(carrierHint)}&number=${encodeURIComponent(trackingNumber)}`
	);
}

async function uploadObject(
	logger: AppLogger,
	bucket: string,
	key: string,
	bytes: Uint8Array,
	contentType: string
): Promise<{ key: string; url: string | null } | null> {
	const base = gatewayBaseUrl();
	if (!base) return null;
	try {
		const res = await fetch(`${base}/v1/storage/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`, {
			method: 'PUT',
			headers: { 'content-type': contentType, ...dataApiAuthHeaders() },
			body: bytes,
			signal: AbortSignal.timeout(IMAGE_RENDER_TIMEOUT_MS)
		});
		if (!res.ok) throw new Error(`data-api storage ${res.status}`);
		return (await res.json()) as { key: string; url: string | null };
	} catch (error) {
		logger.warn(`[data-api] storage upload failed for ${bucket}/${key}: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

export async function searchDeliveryCarriers(query: string): Promise<DeliveryCarrier[]> {
	const result = await gatewayGet<{ carriers: DeliveryCarrier[] }>(`/v1/delivery/carriers?q=${encodeURIComponent(query)}`);
	return result.carriers;
}

export async function fetchWeather(location: string, scope: WeatherScope = 'now'): Promise<WeatherResult> {
	return gatewayGet<WeatherResult>(`/v1/weather?location=${encodeURIComponent(location)}&scope=${scope}`);
}

export interface ProfileCardRequest {
	preset?: 'dark' | 'ticket' | 'dashboard' | 'light' | 'aura';
	themePreset?: string;
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
	topTracks: { title: string; artist: string; thumbnailUrl: string | null }[];
	gameStats?: {
		rpsWins: number;
		rpsLosses: number;
		rpsDraws: number;
		rpsBestStreak: number;
		guessBest: number | null;
	} | null;
	checkinStreak?: number | null;
	status?: 'online' | 'idle' | 'dnd' | 'invisible';
	statusLabel?: string;
	intro?: string;
	roleChips?: string[];
	guildTag?: string | null;
	guildTagBadgeUrl?: string | null;
	nowPlaying?: { title: string; artist: string; thumbnailUrl: string | null } | null;
}

export interface NowPlayingCardRequest {
	trackId: string;
	title: string;
	artist: string;
	artworkUrl: string | null;
	positionMs: number;
	durationMs: number;
	isStream: boolean;
	isPaused?: boolean;
	repeatMode?: 'off' | 'track' | 'queue';
	isRecommended?: boolean;
	nextTracks?: Array<{ title: string; artist: string | null }>;
	queueCount: number;
	queueRemainingMs: number;
	volume: number | null;
	nodeId: string | null;
	brandLine: string | null;
	chapter?: { name: string; startMs: number; endMs: number } | null;
	requester?: { name: string; avatarUrl: string | null } | null;
	trackUrl?: string | null;
}

async function renderNowPlayingCard(logger: AppLogger, data: NowPlayingCardRequest): Promise<Buffer | null> {
	return renderImage(logger, '/v1/image/nowplaying', data);
}

export interface WeatherCardRequest {
	scope: WeatherScope;
	locationLabel: string;
	observedAt: string;
	weatherCode: number | null;
	weatherText: string;
	isDay: boolean | null;
	temperatureC: number | null;
	feelsLikeC: number | null;
	humidityPercent: number | null;
	windSpeedKmh: number | null;
	cloudCoverPercent: number | null;
	precipitationMm: number | null;
	airQuality: AirQualityInfo | null;
	daily: Array<{
		date: string;
		weatherCode: number | null;
		weatherText: string;
		tempMin: number | null;
		tempMax: number | null;
		precipitationProbabilityMaxPct: number | null;
		precipitationSumMm: number | null;
		windSpeedMaxKmh: number | null;
	}>;
}

export interface OhaasaCardRequest {
	zodiacCode: string;
	rank: number;
	luckyItem?: string;
	luckyKey?: string;
	date: string;
}

export interface OhaasaTopCardRequest {
	items: Array<{ zodiacCode: string; rank: number }>;
	date: string;
}

async function renderOhaasaCard(logger: AppLogger, data: OhaasaCardRequest): Promise<Buffer | null> {
	return renderImage(logger, '/v1/image/ohaasa', data);
}

async function renderOhaasaTopCard(logger: AppLogger, data: OhaasaTopCardRequest): Promise<Buffer | null> {
	return renderImage(logger, '/v1/image/ohaasa/top', data);
}

async function renderWeatherCard(logger: AppLogger, data: WeatherCardRequest): Promise<Buffer | null> {
	return renderImage(logger, '/v1/image/weather', data);
}

async function renderProfileCard(logger: AppLogger, data: ProfileCardRequest): Promise<Buffer | null> {
	return renderImage(logger, '/v1/image/profile', data);
}

export interface MemberCardRenderContext {
	userId: string;
	username: string;
	displayName: string;
	guildName: string | null;
	avatarUrl: string | null;
	memberCount: number;
}

async function renderMemberCard(
	logger: AppLogger,
	guildId: string,
	kind: GreetingCardKind,
	config: GreetingConfig,
	context: MemberCardRenderContext
): Promise<RenderedImage | null> {
	return renderImageTyped(logger, '/v1/image/member-card', { guildId, kind, config, context }, MEMBER_CARD_RENDER_TIMEOUT_MS);
}

export interface WrappedCardRequest {
	userId: string;
	guildId: string | null;
	displayName: string;
	avatarUrl: string | null;
	period: 'month' | 'year' | 'all';
}

async function renderWrappedCard(logger: AppLogger, data: WrappedCardRequest): Promise<Buffer | null> {
	return renderImage(logger, '/v1/image/wrapped', data);
}

export interface DataApiClientDeps {
	logger: AppLogger;
}

export function createDataApiClient(deps: DataApiClientDeps) {
	const { logger } = deps;
	return {
		renderNowPlayingCard: (data: NowPlayingCardRequest) => renderNowPlayingCard(logger, data),
		renderOhaasaCard: (data: OhaasaCardRequest) => renderOhaasaCard(logger, data),
		renderOhaasaTopCard: (data: OhaasaTopCardRequest) => renderOhaasaTopCard(logger, data),
		renderWeatherCard: (data: WeatherCardRequest) => renderWeatherCard(logger, data),
		renderProfileCard: (data: ProfileCardRequest) => renderProfileCard(logger, data),
		renderWrappedCard: (data: WrappedCardRequest) => renderWrappedCard(logger, data),
		renderMemberCard: (guildId: string, kind: GreetingCardKind, config: GreetingConfig, context: MemberCardRenderContext) =>
			renderMemberCard(logger, guildId, kind, config, context),
		uploadObject: (bucket: string, key: string, bytes: Uint8Array, contentType: string) => uploadObject(logger, bucket, key, bytes, contentType)
	};
}

export type DataApiClient = ReturnType<typeof createDataApiClient>;
