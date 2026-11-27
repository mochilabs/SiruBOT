import { afterEach, describe, expect, it, vi } from 'vitest';
import { sharedCache } from '../utils/cache.ts';
import { outboundPool, ProxyUnavailableError } from '../utils/proxyPool.ts';
import {
	captionFailKey,
	fetchCaptionLyrics,
	guessSpokenLanguage,
	pairKoreanLines,
	parseJson3Captions,
	pickCaptionTracks
} from './youtubeCaptions.ts';

const track = (language_code: string, kind?: string) => ({ base_url: `https://x/${language_code}`, language_code, kind });

const captions = (texts: string[]) => JSON.stringify({ events: texts.map((utf8, i) => ({ tStartMs: i * 1000, segs: [{ utf8 }] })) });

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

	it('trims symbols around a line but keeps brackets, quotes and punctuation that belong to the text', () => {
		const lines = parseJson3Captions(captions(['~ ♡ Hello world ♡ ~', '- "Quoted?" -', '★ (Whispers) hello ★', '… and then!']));
		expect(lines.map((l) => l.text)).toEqual(['Hello world', '"Quoted?"', '(Whispers) hello', 'and then!']);
	});

	it('drops lines that repeat the same thing over and over', () => {
		const lines = parseJson3Captions(
			captions([
				'yeah yeah yeah yeah yeah yeah yeah yeah',
				'아아아아아아아아',
				'ㅋㅋㅋㅋㅋㅋㅋㅋㅋ',
				'na na na na na na na na na na',
				'I love you I love you',
				'Real line'
			])
		);
		expect(lines.map((l) => l.text)).toEqual(['I love you I love you', 'Real line']);
	});

	it('collapses a line split into quick back-to-back pieces into one that lasts until the last piece ends', () => {
		const raw = JSON.stringify({
			events: [
				{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Hold on' }] },
				{ tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'one by one' }] },
				{ tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'one by one' }] },
				{ tStartMs: 3000, dDurationMs: 1500, segs: [{ utf8: 'one by one' }] },
				{ tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: 'Hold on' }] }
			]
		});
		expect(parseJson3Captions(raw)).toEqual([
			{ startMs: 0, text: 'Hold on', endMs: 1000 },
			{ startMs: 1000, text: 'one by one', endMs: 4500 },
			{ startMs: 5000, text: 'Hold on', endMs: 6000 }
		]);
	});

	it('keeps a line sung again later as its own line instead of stretching the first one', () => {
		const raw = JSON.stringify({
			events: [
				{ tStartMs: 0, dDurationMs: 2500, segs: [{ utf8: 'one by one' }] },
				{ tStartMs: 2500, dDurationMs: 2500, segs: [{ utf8: 'one by one' }] },
				{ tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: '[Music]' }] },
				{ tStartMs: 30000, dDurationMs: 1000, segs: [{ utf8: 'one by one' }] }
			]
		});
		expect(parseJson3Captions(raw)).toEqual([
			{ startMs: 0, text: 'one by one', endMs: 2500 },
			{ startMs: 2500, text: 'one by one', endMs: 5000 },
			{ startMs: 30000, text: 'one by one', endMs: 31000 }
		]);
	});

	it('splits quick repeats when there is a gap between them', () => {
		const raw = JSON.stringify({
			events: [
				{ tStartMs: 0, dDurationMs: 500, segs: [{ utf8: 'Hey' }] },
				{ tStartMs: 1000, dDurationMs: 500, segs: [{ utf8: 'Hey' }] }
			]
		});
		expect(parseJson3Captions(raw).map((l) => l.startMs)).toEqual([0, 1000]);
	});

	it('only merges repeats without durations when they start close together', () => {
		const lines = parseJson3Captions(captions(['Go', 'Go', 'Stop']).replace(/"tStartMs":2000/, '"tStartMs":4000'));
		expect(lines.map((l) => l.startMs)).toEqual([0, 4000]);
		const spread = parseJson3Captions(JSON.stringify({ events: [0, 3000].map((tStartMs) => ({ tStartMs, segs: [{ utf8: 'Go' }] })) }));
		expect(spread.map((l) => l.startMs)).toEqual([0, 3000]);
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

describe('fetchCaptionLyrics', () => {
	afterEach(async () => {
		vi.restoreAllMocks();
		await sharedCache.disconnect();
	});

	it('skips videos that were blocked on every route recently', async () => {
		const run = vi.spyOn(outboundPool(), 'run');
		await sharedCache.set(captionFailKey('dQw4w9WgXcQ'), '1', 60);
		await expect(fetchCaptionLyrics('dQw4w9WgXcQ')).resolves.toEqual({ status: 'error' });
		expect(run).not.toHaveBeenCalled();
	});

	it('remembers a video for six hours when every route is blocked', async () => {
		vi.spyOn(outboundPool(), 'run').mockRejectedValue(new ProxyUnavailableError('captions', 'all routes cooling down'));
		const set = vi.spyOn(sharedCache, 'set');
		await expect(fetchCaptionLyrics('aaaaaaaaaaa')).resolves.toEqual({ status: 'error' });
		expect(set).toHaveBeenCalledWith(captionFailKey('aaaaaaaaaaa'), '1', 6 * 3600);
	});

	it('does not remember ordinary failures', async () => {
		vi.spyOn(outboundPool(), 'run').mockRejectedValue(new Error('parse failed'));
		const set = vi.spyOn(sharedCache, 'set');
		await expect(fetchCaptionLyrics('bbbbbbbbbbb')).resolves.toEqual({ status: 'error' });
		expect(set).not.toHaveBeenCalled();
	});

	it('reports none when the video has no uploader captions', async () => {
		vi.spyOn(outboundPool(), 'run').mockResolvedValue(null);
		await expect(fetchCaptionLyrics('ccccccccccc')).resolves.toEqual({ status: 'none' });
	});

	it('rejects malformed ids without any lookup', async () => {
		const run = vi.spyOn(outboundPool(), 'run');
		await expect(fetchCaptionLyrics('bad id')).resolves.toEqual({ status: 'none' });
		expect(run).not.toHaveBeenCalled();
	});
});
