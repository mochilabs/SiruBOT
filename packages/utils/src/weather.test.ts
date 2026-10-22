import { describe, expect, it } from 'vitest';
import { WeatherError } from './weather.ts';

describe('WeatherError', () => {
	it('identifier·message·name을 식별자로 가지고 instanceof Error예요', () => {
		const error = new WeatherError('weather_location_not_found', '해당 위치를 찾을 수 없어요.');
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('WeatherError');
		expect(error.identifier).toBe('weather_location_not_found');
		expect(error.message).toBe('해당 위치를 찾을 수 없어요.');
	});
});
