/**
 * 날씨 도메인 계약 — 타입과 에러 클래스의 단일 홈.
 *
 * 조회 구현은 data-api(`/v1/weather`, `apps/data-api/src/providers/weather.ts`)가 소유하고,
 * 봇은 `services/dataApiClient.ts`의 fetchWeather로 게이트웨이를 호출해 같은 타입을 써요.
 * 조회 실패는 각 앱 쪽에서 UserError·HTTP 400으로 처리해요.
 */

export type WeatherScope = 'now' | 'today' | 'tomorrow' | 'week';

/** 날씨 조회 실패, 서브패스별 단일 홈 정책이라 공용 Error 베이스 없이 이 파일에 정의해요 */
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
