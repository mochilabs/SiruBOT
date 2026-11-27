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
