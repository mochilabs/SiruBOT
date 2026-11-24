import { describe, expect, it } from 'vitest';
import { pairKoreanLines, parseJson3Captions, pickCaptionTracks } from './youtubeCaptions.ts';

const track = (language_code: string, kind?: string) => ({ base_url: `https://x/${language_code}`, language_code, kind });

describe('parseJson3Captions', () => {
	it('keeps lyric lines in order and drops sound tags and note-only lines', () => {
		const raw = JSON.stringify({
			events: [
				{ tStartMs: 3000, dDurationMs: 1500, segs: [{ utf8: 'Never gonna' }, { utf8: ' give you up\n' }] },
				{ tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: '[Music]' }] },
				{ tStartMs: 2000, segs: [{ utf8: '♪' }] },
				{ tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: '♪ Never gonna let you down ♪' }] },
				{ tStartMs: 6000, segs: [] }
			]
		});
		expect(parseJson3Captions(raw)).toEqual([
			{ startMs: 3000, text: 'Never gonna give you up', endMs: 4500 },
			{ startMs: 5000, text: 'Never gonna let you down', endMs: 6000 }
		]);
	});

	it('returns an empty list for broken input', () => {
		expect(parseJson3Captions('not json')).toEqual([]);
		expect(parseJson3Captions('')).toEqual([]);
	});
});

describe('pickCaptionTracks', () => {
	it('ignores auto-generated tracks', () => {
		expect(pickCaptionTracks([track('en', 'asr')])).toBeNull();
	});

	it('uses the spoken language track as the original and a Korean track as translation', () => {
		const picked = pickCaptionTracks([track('ko'), track('en'), track('en', 'asr'), track('ja')]);
		expect(picked?.original.language_code).toBe('en');
		expect(picked?.korean?.language_code).toBe('ko');
	});

	it('treats a Korean-only upload as the original', () => {
		const picked = pickCaptionTracks([track('ko'), track('ko', 'asr')]);
		expect(picked?.original.language_code).toBe('ko');
		expect(picked?.korean).toBeNull();
	});
});

describe('pairKoreanLines', () => {
	it('pairs by nearest start time within 1.5 seconds', () => {
		const original = [
			{ startMs: 1000, text: 'Hello', endMs: null },
			{ startMs: 5000, text: 'Goodbye', endMs: null }
		];
		const korean = [
			{ startMs: 1200, text: '안녕', endMs: null },
			{ startMs: 9000, text: '멀리 떨어진 줄', endMs: null }
		];
		expect(pairKoreanLines(original, korean)).toEqual({ Hello: '안녕' });
	});
});
