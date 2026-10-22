/**
 * data-api 게이트웨이 DTO 타입의 단일 출처.
 *
 * `services/dataApiClient.ts`가 반환하고 명령어·AI 도구가 소비해요.
 * 모듈 내부 타입을 services가 거꾸로 참조하지 않도록 순수 응답 타입만 여기로 모읍니다.
 */

// --- 오하아사 (/v1/ohaasa) ---

export interface HoroscopeData {
	rank: number;
	zodiacCode: string;
	zodiac: { jp: string; ko: string; en: string };
	content: string;
	lucky: string;
}

export interface DailyHoroscope {
	date: string;
	source: 'ohaasa' | 'tv-asahi';
	/** content/lucky가 AI로 한국어 번역됐는지 (false면 일본어 원문) */
	translated: boolean;
	horoscopes: HoroscopeData[];
}

// --- 택배 (/v1/delivery/*) ---

export interface DeliveryCarrier {
	id: string;
	name: string;
	tel?: string;
}

export interface DeliveryProgress {
	time: string | null;
	statusText: string;
	location: string | null;
	description: string | null;
}

export interface DeliveryTrackResult {
	carrier: DeliveryCarrier;
	stateText: string;
	fromName: string | null;
	fromTime: string | null;
	toName: string | null;
	toTime: string | null;
	progresses: DeliveryProgress[];
}

// --- 날씨 (/v1/weather) ---

export type WeatherScope = 'now' | 'today' | 'tomorrow' | 'week';

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
