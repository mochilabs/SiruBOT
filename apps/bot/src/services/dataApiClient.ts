import { container } from '@sapphire/framework';
import { fetchOhaasaKo as fetchOhaasaKoLegacy } from './ohaasaTranslate.ts';
import { fetchWeather as fetchWeatherLocal, type WeatherResult, type WeatherScope } from '../modules/general/utils/weatherService.ts';
import type { DailyHoroscope } from '../modules/games/utils/ohaasaService.ts';

export { WeatherError } from '../modules/general/utils/weatherService.ts';
export type { WeatherResult, WeatherScope } from '../modules/general/utils/weatherService.ts';

export interface LyricsResult {
	trackName: string;
	artistName: string;
	plainLyrics: string | null;
	syncedLyrics: string | null;
}

const GATEWAY_TIMEOUT_MS = 10_000;

function gatewayBaseUrl(): string | null {
	const raw = (process.env.DATA_API_URL ?? '').trim().replace(/\/+$/, '');
	return raw || null;
}

/** data-api GET. 미설정·실패 시 throw → 호출자가 레거시 직접 호출로 폴백해요. */
async function gatewayGet<T>(path: string): Promise<T> {
	const base = gatewayBaseUrl();
	if (!base) throw new Error('data-api disabled');
	const authKey = (process.env.DATA_API_AUTH_KEY ?? process.env.AUTH_KEY ?? '').trim();
	const res = await fetch(`${base}${path}`, {
		headers: { ...(authKey ? { authorization: authKey } : {}) },
		signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS)
	});
	if (!res.ok) throw new Error(`data-api ${res.status}`);
	return (await res.json()) as T;
}

function fallbackNote(feature: string, error: unknown): void {
	container.logger.debug(`[data-api] ${feature} fallback to local: ${error instanceof Error ? error.message : String(error)}`);
}

/** 오늘의 오하아사 — 게이트웨이 우선, 실패 시 기존 Redis+LLM 직접 경로 */
export async function fetchOhaasaKo(): Promise<DailyHoroscope> {
	try {
		return await gatewayGet<DailyHoroscope>('/v1/ohaasa');
	} catch (error) {
		fallbackNote('ohaasa', error);
		return fetchOhaasaKoLegacy();
	}
}

export async function searchLyrics(query: string): Promise<LyricsResult[]> {
	const q = query.replace(/\(.*?\)|\[.*?\]/g, '').trim();
	try {
		const data = await gatewayGet<LyricsResult | LyricsResult[]>(`/v1/lyrics?q=${encodeURIComponent(q)}`);
		const results = Array.isArray(data) ? data : [data];
		if (!results?.length || !results[0]?.trackName) throw new Error('lyrics not found');
		return results;
	} catch (error) {
		fallbackNote('lyrics', error);
		const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
			headers: { 'User-Agent': 'SiruBOT/1.0' },
			signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS)
		});
		if (!res.ok) throw new Error('가사를 검색하는 중 오류가 발생했어요.');
		return (await res.json()) as LyricsResult[];
	}
}

/** 날씨 — 게이트웨이 우선, 실패 시 기존 Open-Meteo 직접 경로 */
export async function fetchWeather(location: string, scope: WeatherScope = 'now'): Promise<WeatherResult> {
	try {
		return await gatewayGet<WeatherResult>(`/v1/weather?location=${encodeURIComponent(location)}&scope=${scope}`);
	} catch (error) {
		fallbackNote('weather', error);
		return fetchWeatherLocal(location, scope);
	}
}
