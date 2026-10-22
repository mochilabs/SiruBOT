/**
 * 날씨 도메인 타입.
 *
 * 날씨 조회 자체는 data-api(`/v1/weather`, providers/weather.ts)가 담당 —
 * 봇은 `services/dataApiClient.ts`의 fetchWeather로 게이트웨이를 호출하고,
 * 타입만 이 파일에서 가져가요. 조회 실패는 명령어 쪽에서 UserError로 처리해요.
 */

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
