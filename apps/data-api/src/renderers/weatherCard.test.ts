import { describe, expect, it } from 'vitest';
import { weatherCardSchema } from '../routes/weatherCardSchema.ts';
import { dayLabel, emojiForCode, renderWeatherCard, toneForCode } from './weatherCard.ts';

/** 날씨 카드 렌더 스모크 — 범위별 캔버스 크기와 코드 매핑 헬퍼를 검증해요. */

const day = (date: string, code: number, max: number, min: number) => ({
	date,
	weatherCode: code,
	weatherText: '맑음',
	tempMin: min,
	tempMax: max,
	precipitationProbabilityMaxPct: 20,
	precipitationSumMm: 0,
	windSpeedMaxKmh: 10
});

const base = {
	locationLabel: '서울, 대한민국',
	observedAt: '2026-11-08 20:00',
	weatherCode: 0,
	weatherText: '맑음',
	isDay: true,
	temperatureC: 18.2,
	feelsLikeC: 16.9,
	humidityPercent: 45,
	windSpeedKmh: 7.6,
	cloudCoverPercent: 12,
	precipitationMm: 0,
	airQuality: null,
	daily: []
};

function pngSize(buffer: Buffer): [number, number] {
	expect([buffer[0], buffer[1], buffer[2], buffer[3]]).toEqual([137, 80, 78, 71]);
	return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

describe('renderWeatherCard', () => {
	it('renders the current-weather card as a 960x320 PNG', async () => {
		const buffer = await renderWeatherCard(weatherCardSchema.parse({ ...base, scope: 'now' }));
		expect(pngSize(buffer)).toEqual([960, 320]);
		expect(buffer.length).toBeGreaterThan(1_000);
	});

	it('renders today/tomorrow cards from the first daily entry', async () => {
		const buffer = await renderWeatherCard(weatherCardSchema.parse({ ...base, scope: 'tomorrow', daily: [day('2026-11-09', 2, 20, 11)] }));
		expect(pngSize(buffer)).toEqual([960, 320]);
	});

	it('renders the week strip as a 960x330 PNG', async () => {
		const daily = Array.from({ length: 7 }, (_, i) => day(`2026-11-${String(8 + i).padStart(2, '0')}`, i * 10, 20 - i, 8 - i));
		const buffer = await renderWeatherCard(weatherCardSchema.parse({ ...base, scope: 'week', daily }));
		expect(pngSize(buffer)).toEqual([960, 330]);
	});

	it('still renders when the provider returns no numbers or no forecast', async () => {
		const empty = {
			...base,
			temperatureC: null,
			feelsLikeC: null,
			humidityPercent: null,
			windSpeedKmh: null,
			cloudCoverPercent: null,
			precipitationMm: null
		};
		expect(pngSize(await renderWeatherCard(weatherCardSchema.parse({ ...empty, scope: 'now' })))).toEqual([960, 320]);
		expect(pngSize(await renderWeatherCard(weatherCardSchema.parse({ ...empty, scope: 'week' })))).toEqual([960, 330]);
	});
});

describe('weather code helpers', () => {
	it('maps WMO codes to tones', () => {
		expect(toneForCode(0)).toBe('clear');
		expect(toneForCode(3)).toBe('cloud');
		expect(toneForCode(45)).toBe('fog');
		expect(toneForCode(63)).toBe('rain');
		expect(toneForCode(81)).toBe('rain');
		expect(toneForCode(73)).toBe('snow');
		expect(toneForCode(96)).toBe('storm');
		expect(toneForCode(null)).toBe('cloud');
	});

	it('shows the moon for clear nights only', () => {
		expect(emojiForCode(0, true)).toBe('☀️');
		expect(emojiForCode(0, false)).toBe('🌙');
		expect(emojiForCode(63, false)).toBe('🌧️');
	});

	it('labels dates with weekday and month/day', () => {
		expect(dayLabel('2026-11-08')).toEqual({ weekday: '일', md: '11/8' });
		expect(dayLabel('2026-11-09')).toEqual({ weekday: '월', md: '11/9' });
	});
});

describe('weatherCardSchema', () => {
	it('rejects an unknown scope and a malformed date', () => {
		expect(() => weatherCardSchema.parse({ ...base, scope: 'month' })).toThrow();
		expect(() => weatherCardSchema.parse({ ...base, scope: 'week', daily: [{ ...day('11/08', 0, 1, 0) }] })).toThrow();
	});
});
