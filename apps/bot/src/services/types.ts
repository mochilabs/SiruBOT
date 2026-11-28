export interface ServiceLogger {
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
	debug(msg: string): void;
}

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
	translated: boolean;
	horoscopes: HoroscopeData[];
}

export type { DeliveryCarrier, DeliveryProgress, DeliveryTrackResult } from '@sirubot/utils/delivery';
export type { AirQualityInfo, DailyForecastDay, WeatherResult, WeatherScope } from '@sirubot/utils/weather';
