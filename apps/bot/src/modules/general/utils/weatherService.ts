import { normalizeWeatherLocationQuery } from './weatherLocality.ts';

const GEOCODING_BASE_URL = 'https://geocoding-api.open-meteo.com/v1';
const FORECAST_BASE_URL = 'https://api.open-meteo.com/v1';
const AIR_QUALITY_BASE_URL = 'https://air-quality-api.open-meteo.com/v1';
const WEATHER_TIMEOUT_MS = 15_000;
const GEO_PER_REQUEST_TIMEOUT_MS = 5_000;

export type WeatherScope = 'now' | 'today' | 'tomorrow' | 'week';

export class WeatherError extends Error {
	public constructor(
		public readonly identifier: string,
		message: string
	) {
		super(message);
		this.name = 'WeatherError';
	}
}

export interface DailyForecastDay {
	date: string;
	weatherCode: number | null;
	weatherTextKo: string;
	tempMin: number | null;
	tempMax: number | null;
	precipitationProbabilityMaxPct: number | null;
	precipitationSumMm: number | null;
	windSpeedMaxKmh: number | null;
}

export interface AirQualityInfo {
	pm25: number | null;
	pm10: number | null;
	pm25GradeKo: string;
	pm10GradeKo: string;
}

export interface WeatherResult {
	localityName: string;
	country: string;
	timezone: string;
	query: string;
	temperatureC: number | null;
	feelsLikeC: number | null;
	humidityPercent: number | null;
	windSpeedKmh: number | null;
	windDirectionDeg: number | null;
	cloudCoverPercent: number | null;
	precipitationMm: number | null;
	weatherCode: number | null;
	weatherTextKo: string;
	isDay: boolean | null;
	airQuality: AirQualityInfo | null;
	daily: DailyForecastDay[];
	scope: WeatherScope;
	observedAt: string;
}

function toNum(v: unknown): number | null {
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function weatherCodeToTextKo(code: number | null): string {
	if (code == null) return '알 수 없음';
	if (code === 0) return '맑음';
	if ([1, 2, 3].includes(code)) return '구름 조금~많음';
	if ([45, 48].includes(code)) return '안개';
	if ([51, 53, 55].includes(code)) return '이슬비';
	if ([56, 57].includes(code)) return '동결 이슬비';
	if ([61, 63, 65].includes(code)) return '비';
	if ([66, 67].includes(code)) return '동결 비';
	if ([71, 73, 75].includes(code)) return '눈';
	if (code === 77) return '싸락눈';
	if ([80, 81, 82].includes(code)) return '소나기';
	if ([85, 86].includes(code)) return '눈 소나기';
	if ([95, 96, 99].includes(code)) return '뇌우';
	return '알 수 없음';
}

function pm25GradeKo(ug: number | null): string {
	if (ug == null) return '정보 없음';
	if (ug <= 15) return '좋음';
	if (ug <= 35) return '보통';
	if (ug <= 75) return '나쁨';
	return '매우 나쁨';
}

function pm10GradeKo(ug: number | null): string {
	if (ug == null) return '정보 없음';
	if (ug <= 30) return '좋음';
	if (ug <= 80) return '보통';
	if (ug <= 150) return '나쁨';
	return '매우 나쁨';
}

async function fetchJson(url: URL, signal: AbortSignal, timeoutMs: number): Promise<any> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const onAbort = () => controller.abort();
	signal.addEventListener('abort', onAbort, { once: true });
	try {
		const res = await fetch(url, { signal: controller.signal });
		if (!res.ok) throw new WeatherError('weather_http_error', `HTTP ${res.status}`);
		return await res.json();
	} finally {
		clearTimeout(timer);
		signal.removeEventListener('abort', onAbort);
	}
}

function buildGeocodeCandidateNames(rawInput: string, geocodeQuery: string, originalQuery: string): string[] {
	const seen = new Set<string>();
	const add = (s: string) => {
		const t = String(s ?? '')
			.trim()
			.replace(/\s+/g, ' ');
		if (t) seen.add(t);
	};
	add(rawInput);
	add(originalQuery);
	add(geocodeQuery);
	for (const s of [...seen]) {
		const parts = s.split(/\s+/).filter(Boolean);
		if (parts.length >= 2) add(parts[parts.length - 1]!);
		if (parts.length >= 3) add(parts.slice(-2).join(' '));
	}
	for (const s of [...seen]) {
		if (/[가-힣]/.test(s)) {
			const simplified = s.replace(/(특별시|광역시|특별자치시|특별자치도|시|군|구|도)$/, '');
			if (simplified && simplified !== s) add(simplified);
		}
	}
	return [...seen];
}

async function geocodeFirstResult(name: string, language: string, signal: AbortSignal): Promise<Record<string, any> | null> {
	const q = name.trim();
	if (!q) return null;
	const url = new URL(`${GEOCODING_BASE_URL}/search`);
	url.searchParams.set('name', q);
	url.searchParams.set('count', '1');
	url.searchParams.set('language', language);
	url.searchParams.set('format', 'json');
	try {
		const body = await fetchJson(url, signal, GEO_PER_REQUEST_TIMEOUT_MS);
		const top = Array.isArray(body?.results) ? body.results[0] : null;
		return top && typeof top === 'object' ? top : null;
	} catch {
		return null;
	}
}

async function resolveGeocode(rawInput: string, signal: AbortSignal) {
	const { geocodeQuery, originalQuery } = normalizeWeatherLocationQuery(rawInput);
	const names = buildGeocodeCandidateNames(rawInput, geocodeQuery || rawInput, originalQuery);
	for (const name of names) {
		const hasKo = /[가-힣]/.test(name);
		const langs = hasKo ? (['ko', 'en'] as const) : (['en', 'ko'] as const);
		for (const lang of langs) {
			const top = await geocodeFirstResult(name, lang, signal);
			const lat = top ? toNum(top.latitude) : null;
			const lon = top ? toNum(top.longitude) : null;
			if (top && lat != null && lon != null) return { top, lat, lon, resolvedQuery: name };
		}
	}
	return null;
}

async function fetchAirQuality(latitude: number, longitude: number, signal: AbortSignal): Promise<AirQualityInfo | null> {
	const url = new URL(`${AIR_QUALITY_BASE_URL}/air-quality`);
	url.searchParams.set('latitude', String(latitude));
	url.searchParams.set('longitude', String(longitude));
	url.searchParams.set('current', 'pm2_5,pm10');
	url.searchParams.set('timezone', 'auto');
	try {
		const body = await fetchJson(url, signal, GEO_PER_REQUEST_TIMEOUT_MS);
		const cur = body?.current ?? {};
		const pm25 = toNum(cur.pm2_5);
		const pm10 = toNum(cur.pm10);
		return { pm25, pm10, pm25GradeKo: pm25GradeKo(pm25), pm10GradeKo: pm10GradeKo(pm10) };
	} catch {
		return null;
	}
}

function buildDailyDays(daily: any, startIdx: number, length: number): DailyForecastDay[] {
	const out: DailyForecastDay[] = [];
	const dates: string[] = Array.isArray(daily?.time) ? daily.time : [];
	for (let i = 0; i < length; i++) {
		const idx = startIdx + i;
		if (idx < 0 || idx >= dates.length) continue;
		const code = toNum(daily?.weather_code?.[idx]);
		out.push({
			date: String(dates[idx] ?? ''),
			weatherCode: code,
			weatherTextKo: weatherCodeToTextKo(code),
			tempMin: toNum(daily?.temperature_2m_min?.[idx]),
			tempMax: toNum(daily?.temperature_2m_max?.[idx]),
			precipitationProbabilityMaxPct: toNum(daily?.precipitation_probability_max?.[idx]),
			precipitationSumMm: toNum(daily?.precipitation_sum?.[idx]),
			windSpeedMaxKmh: toNum(daily?.wind_speed_10m_max?.[idx])
		});
	}
	return out;
}

export async function fetchWeather(location: string, scope: WeatherScope = 'now'): Promise<WeatherResult> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
	try {
		const rawInput = String(location ?? '').trim();
		if (!rawInput) throw new WeatherError('weather_location_required', '위치를 입력해 주세요.');

		let latitude: number;
		let longitude: number;
		let localityName: string;
		let country = '';
		let timezone = '';
		let query = rawInput;

		const latLonMatch = /^(-?\d+\.?\d*),(-?\d+\.?\d*)$/.exec(rawInput);
		if (latLonMatch) {
			const lat = toNum(latLonMatch[1]);
			const lon = toNum(latLonMatch[2]);
			if (lat == null || lon == null) throw new WeatherError('weather_invalid_coordinates', '좌표 형식이 올바르지 않아요.');
			latitude = lat;
			longitude = lon;
			localityName = rawInput;
		} else {
			const resolved = await resolveGeocode(rawInput, controller.signal);
			if (!resolved) throw new WeatherError('weather_location_not_found', '해당 위치를 찾을 수 없어요. 다른 이름으로 다시 시도해 주세요.');
			latitude = resolved.lat;
			longitude = resolved.lon;
			localityName = String(resolved.top.name ?? rawInput);
			country = String(resolved.top.country ?? '');
			timezone = String(resolved.top.timezone ?? '');
			query = resolved.resolvedQuery;
		}

		const url = new URL(`${FORECAST_BASE_URL}/forecast`);
		url.searchParams.set('latitude', String(latitude));
		url.searchParams.set('longitude', String(longitude));
		if (scope !== 'now') {
			url.searchParams.set('forecast_days', '7');
			url.searchParams.set(
				'daily',
				[
					'weather_code',
					'temperature_2m_max',
					'temperature_2m_min',
					'precipitation_sum',
					'precipitation_probability_max',
					'wind_speed_10m_max'
				].join(',')
			);
		}
		url.searchParams.set(
			'current',
			[
				'temperature_2m',
				'relative_humidity_2m',
				'apparent_temperature',
				'precipitation',
				'weather_code',
				'cloud_cover',
				'wind_speed_10m',
				'wind_direction_10m',
				'is_day'
			].join(',')
		);
		url.searchParams.set('timezone', 'auto');

		let body: any;
		try {
			body = await fetchJson(url, controller.signal, WEATHER_TIMEOUT_MS);
		} catch (e) {
			if (e instanceof WeatherError) throw e;
			throw new WeatherError('weather_unreachable', '날씨 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
		}

		const current = body?.current ?? {};
		const dailyRaw = body?.daily ?? {};
		const dayCount = Array.isArray(dailyRaw?.time) ? dailyRaw.time.length : 0;

		let daily: DailyForecastDay[] = [];
		if (scope === 'today') daily = buildDailyDays(dailyRaw, 0, 1);
		else if (scope === 'tomorrow') {
			if (dayCount < 2) throw new WeatherError('weather_forecast_unavailable', '내일 예보를 가져올 수 없어요.');
			daily = buildDailyDays(dailyRaw, 1, 1);
		} else if (scope === 'week') daily = buildDailyDays(dailyRaw, 0, Math.min(7, dayCount));

		const weatherCode = toNum(current.weather_code);
		let weatherTextKo = weatherCodeToTextKo(weatherCode);
		if ((scope === 'tomorrow' || scope === 'week') && daily[0]) weatherTextKo = daily[0].weatherTextKo;

		const airQuality = scope === 'now' || scope === 'today' ? await fetchAirQuality(latitude, longitude, controller.signal) : null;

		return {
			localityName,
			country,
			timezone: String(body?.timezone ?? timezone),
			query,
			temperatureC: toNum(current.temperature_2m),
			feelsLikeC: toNum(current.apparent_temperature),
			humidityPercent: toNum(current.relative_humidity_2m),
			windSpeedKmh: toNum(current.wind_speed_10m),
			windDirectionDeg: toNum(current.wind_direction_10m),
			cloudCoverPercent: toNum(current.cloud_cover),
			precipitationMm: toNum(current.precipitation),
			weatherCode,
			weatherTextKo,
			isDay: current.is_day === 1 ? true : current.is_day === 0 ? false : null,
			airQuality,
			daily,
			scope,
			observedAt: String(current.time ?? daily[0]?.date ?? '')
		};
	} finally {
		clearTimeout(timer);
	}
}
