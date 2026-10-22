/**
 * data-api 게이트웨이 DTO 타입의 단일 출처.
 *
 * `services/dataApiClient.ts`가 반환하고 명령어·AI 도구가 소비해요.
 * 모듈 내부 타입을 services가 거꾸로 참조하지 않도록 순수 응답 타입만 여기로 모읍니다.
 * 택배·날씨 계약은 `@sirubot/utils` 서브패스가 단일 홈이라 여기서 재수출만 해요.
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

// --- 택배 (/v1/delivery/*) · 날씨 (/v1/weather) — utils 서브패스 재수출 ---

export type { DeliveryCarrier, DeliveryProgress, DeliveryTrackResult } from '@sirubot/utils/delivery';
export type { AirQualityInfo, DailyForecastDay, WeatherResult, WeatherScope } from '@sirubot/utils/weather';
