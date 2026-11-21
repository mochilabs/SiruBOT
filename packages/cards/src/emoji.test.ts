import { describe, expect, it } from 'vitest';
import { twemojiCandidates, twemojiCdnUrl } from './emoji.js';

describe('twemojiCandidates', () => {
	it('단일 이모지는 코드포인트 하나예요', () => {
		expect(twemojiCandidates('😀')).toEqual(['1f600']);
	});

	it('ZWJ가 없으면 FE0F를 빼요', () => {
		expect(twemojiCandidates('❤️')).toEqual(['2764']);
	});

	it('ZWJ 시퀀스는 그대로 잇고, FE0F를 뺀 후보도 둬요', () => {
		expect(twemojiCandidates('👨‍👩‍👧')).toEqual(['1f468-200d-1f469-200d-1f467']);
		expect(twemojiCandidates('🏳️‍🌈')).toEqual(['1f3f3-fe0f-200d-1f308', '1f3f3-200d-1f308']);
	});

	it('피부색·국기도 코드로 바꿔요', () => {
		expect(twemojiCandidates('👍🏻')).toEqual(['1f44d-1f3fb']);
		expect(twemojiCandidates('🇰🇷')).toEqual(['1f1f0-1f1f7']);
	});

	it('CDN 주소에 버전이 들어가요', () => {
		expect(twemojiCdnUrl('1f600')).toBe('https://cdn.jsdelivr.net/npm/@twemoji/svg@15.0.0/1f600.svg');
	});
});
