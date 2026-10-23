import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWeather, weatherCacheKey } from './weather.ts';
import { normalizeWeatherLocationQuery } from './weatherLocality.ts';

/**
 * weather provider 스모크 — 유저 대상 실패 메시지와 캐시 키·지오코딩 후보 계약을 잠가요.
 * 지오코딩/예보/대기질 세 호출을 URL로 갈라 스텁해서 네트워크 없이 검증해요.
 */

function weatherJson() {
	return {
		timezone: 'Asia/Seoul',
		current: {
			time: '2026-10-23T09:00',
			temperature_2m: 18.4,
			relative_humidity_2m: 55,
			apparent_temperature: 17.2,
			precipitation: 0,
			weather_code: 1,
			cloud_cover: 20,
			wind_speed_10m: 3.2,
			wind_direction_10m: 200,
			is_day: 1
		},
		daily: { time: [] as string[] }
	};
}

/** geocoding 결과가 있을 때/없을 때를 갈라 쓰는 fetch 스텁 */
function stubFetch(geocodeResults: unknown[] | null) {
	const fetchMock = vi.fn(async (input: URL | string) => {
		const url = String(input);
		if (url.includes('geocoding-api')) return Response.json({ results: geocodeResults ?? [] });
		if (url.includes('air-quality-api')) return Response.json({ current: { pm2_5: 12, pm10: 24 } });
		return Response.json(weatherJson());
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

function geocodeNames(fetchMock: ReturnType<typeof stubFetch>): string[] {
	return fetchMock.mock.calls
		.map(([input]) => String(input))
		.filter((url) => url.includes('geocoding-api'))
		.map((url) => new URL(url).searchParams.get('name') ?? '');
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('fetchWeather', () => {
	it('위치가 비어 있으면 입력 요구 메시지로 실패해요', async () => {
		await expect(fetchWeather('   ')).rejects.toMatchObject({ identifier: 'weather_location_required' });
	});

	it('지오코딩 결과가 없으면 다시 시도 안내 메시지로 실패해요', async () => {
		stubFetch(null);
		await expect(fetchWeather('없는지명')).rejects.toMatchObject({
			identifier: 'weather_location_not_found',
			message: '해당 위치를 찾을 수 없어요. 다른 이름으로 다시 시도해 주세요.'
		});
	});

	it('좌표 입력은 지오코딩 없이 예보·대기질만 조회해요', async () => {
		const fetchMock = stubFetch(null);
		const result = await fetchWeather('37.5,127.0');
		expect(result.localityName).toBe('37.5,127.0');
		expect(result.weatherTextKo).toBe('구름 조금~많음');
		expect(result.airQuality?.pm25GradeKo).toBe('좋음');
		expect(geocodeNames(fetchMock)).toEqual([]);
	});

	it('지오코딩 후보에 접미사를 뺀 이름이 포함돼요 (weatherLocality와 공유하는 접미사 규칙)', async () => {
		const fetchMock = stubFetch(null);
		await expect(fetchWeather('도쿄시')).rejects.toMatchObject({ identifier: 'weather_location_not_found' });
		expect(geocodeNames(fetchMock)).toContain('도쿄');
	});
});

describe('weatherCacheKey', () => {
	it('앞뒤 공백과 중간 공백을 정규화해요', () => {
		expect(weatherCacheKey('  Seoul   City  ', 'now')).toBe('dataapi:v1:weather:now:seoul city');
	});
});

describe('normalizeWeatherLocationQuery', () => {
	it('행정구역 접미사만 다른 이름은 같은 매핑으로 해석해요', () => {
		expect(normalizeWeatherLocationQuery('도쿄시').geocodeQuery).toBe(normalizeWeatherLocationQuery('도쿄').geocodeQuery);
	});
});
