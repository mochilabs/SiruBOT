import { z } from 'zod';

const nullableNumber = z.number().finite().nullable().default(null);

/**
 * 날씨 카드 이미지 입력 — 봇이 /v1/weather 응답(WeatherResult)에서 표시에 필요한 필드만 골라 보내요.
 * 위치·시각 문자열은 길이를 제한해 카드 레이아웃이 깨지지 않게 하고, 수치는 null을 허용해요(제공자가 비워 줄 수 있어요).
 */
export const weatherCardSchema = z.object({
	scope: z.enum(['now', 'today', 'tomorrow', 'week']),
	locationLabel: z.string().trim().min(1).max(80),
	observedAt: z.string().trim().max(40).default(''),
	weatherCode: z.number().int().nullable().default(null),
	weatherText: z.string().trim().max(40).default(''),
	isDay: z.boolean().nullable().default(null),
	temperatureC: nullableNumber,
	feelsLikeC: nullableNumber,
	humidityPercent: nullableNumber,
	windSpeedKmh: nullableNumber,
	cloudCoverPercent: nullableNumber,
	precipitationMm: nullableNumber,
	airQuality: z
		.object({
			pm25: nullableNumber,
			pm10: nullableNumber,
			pm25GradeKo: z.string().trim().max(12).default(''),
			pm10GradeKo: z.string().trim().max(12).default('')
		})
		.nullable()
		.default(null),
	daily: z
		.array(
			z.object({
				date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				weatherCode: z.number().int().nullable().default(null),
				weatherText: z.string().trim().max(40).default(''),
				tempMin: nullableNumber,
				tempMax: nullableNumber,
				precipitationProbabilityMaxPct: nullableNumber,
				precipitationSumMm: nullableNumber,
				windSpeedMaxKmh: nullableNumber
			})
		)
		.max(7)
		.default([])
});

export type WeatherCardInput = z.infer<typeof weatherCardSchema>;
