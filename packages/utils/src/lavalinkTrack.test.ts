import { describe, expect, it } from 'vitest';
import { isYouTubeSource, resolveYouTubeVideoId } from './lavalinkTrack.ts';
describe('isYouTubeSource', () => {
	it('youtube 계열 소스만 true예요 (접미사 prefix 판별)', () => {
		expect(isYouTubeSource('youtube')).toBe(true);
		expect(isYouTubeSource('youtubeurl')).toBe(true);
		expect(isYouTubeSource('youtubemusic')).toBe(true);
		expect(isYouTubeSource('soundcloud')).toBe(false);
		expect(isYouTubeSource('http')).toBe(false);
	});

	it('null/undefined/빈 값은 false예요', () => {
		expect(isYouTubeSource(null)).toBe(false);
		expect(isYouTubeSource(undefined)).toBe(false);
		expect(isYouTubeSource('')).toBe(false);
	});
});

describe('resolveYouTubeVideoId', () => {
	it('유튜브 소스의 identifier가 곧 videoId예요', () => {
		expect(resolveYouTubeVideoId({ info: { sourceName: 'youtube', identifier: 'dQw4w9WgXcQ' } })).toBe('dQw4w9WgXcQ');
	});

	it('비유튜브 소스·결측 트랙은 null이에요', () => {
		expect(resolveYouTubeVideoId({ info: { sourceName: 'soundcloud', identifier: 'abc' } })).toBeNull();
		expect(resolveYouTubeVideoId(null)).toBeNull();
		expect(resolveYouTubeVideoId(undefined)).toBeNull();
		expect(resolveYouTubeVideoId({})).toBeNull();
		expect(resolveYouTubeVideoId({ info: {} })).toBeNull();
	});

	it('빈 identifier는 null이에요', () => {
		expect(resolveYouTubeVideoId({ info: { sourceName: 'youtube', identifier: '' } })).toBeNull();
	});
});
