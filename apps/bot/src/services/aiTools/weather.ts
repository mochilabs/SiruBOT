import { fetchWeather, type WeatherScope } from '../dataApiClient.ts';
import type { AiTool } from './types.ts';

const VALID_SCOPES: WeatherScope[] = ['now', 'today', 'tomorrow', 'week'];

export const weatherTool: AiTool = {
	name: 'weather_get',
	description:
		'특정 지역의 현재 날씨·예보·미세먼지를 조회해요. location은 한국어 지명(서울, 부산 등) 또는 주소를 쓰세요. when으로 기간을 고르고, 결과의 weatherTextKo와 airQuality를 사용자에게 한국어로 요약하세요.',
	properties: {
		location: {
			type: 'string',
			description: '지역명 (예: 서울, 강남구, 부산 해운대구)'
		},
		when: {
			type: 'string',
			description: '기간: now(현재, 기본값) | today(오늘) | tomorrow(내일) | week(이번 주)',
			enum: VALID_SCOPES
		}
	},
	required: ['location'],
	status: '시루가 날씨를 확인하는 중..',
	execute: async (args) => {
		const location = String(args.location ?? '').trim();
		if (!location) throw new Error('지역명이 필요해요.');
		const scopeArg = String(args.when ?? 'now') as WeatherScope;
		const scope: WeatherScope = VALID_SCOPES.includes(scopeArg) ? scopeArg : 'now';
		const result = await fetchWeather(location, scope);
		return JSON.stringify(result);
	}
};
