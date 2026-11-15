import { describe, expect, it } from 'vitest';
import { durationMatches, normalizeArtist, normalizeIsrc, normalizeTitle, sourcePriority, trackIdentity } from './trackIdentity.js';

describe('normalizeIsrc', () => {
	it('accepts dashed and lowercase ISRCs', () => {
		expect(normalizeIsrc('jp-u90-18-00001')).toBe('JPU901800001');
	});
	it('rejects values that are not ISRCs', () => {
		expect(normalizeIsrc('abc')).toBeNull();
		expect(normalizeIsrc(undefined)).toBeNull();
	});
});

describe('normalizeTitle', () => {
	it('strips upload labels', () => {
		expect(normalizeTitle('Lemon (Official MV)')).toBe('lemon');
		expect(normalizeTitle('Lemon [가사]')).toBe('lemon');
		expect(normalizeTitle('Lemon (Official Music Video) [4K]')).toBe('lemon');
	});
	it('keeps version labels', () => {
		expect(normalizeTitle('Lemon (Remix)')).toBe('lemon remix');
		expect(normalizeTitle('Lemon (Live)')).toBe('lemon live');
	});
});

describe('normalizeArtist', () => {
	it('strips uploader suffixes', () => {
		expect(normalizeArtist('Kenshi Yonezu - Topic')).toBe('kenshi yonezu');
		expect(normalizeArtist('TaylorSwiftVEVO')).toBe('taylorswift');
		expect(normalizeArtist('NewJeans Official')).toBe('newjeans');
	});
});

describe('trackIdentity', () => {
	it('splits artist from title on YouTube uploads', () => {
		const id = trackIdentity({ title: '米津玄師 - Lemon (Official MV)', author: 'some uploader', sourceName: 'youtube', durationMs: 255_000 });
		expect(id.artist).toBe('米津玄師');
		expect(id.title).toBe('lemon');
		expect(id.recordingKey).toBe('rec:米津玄師|lemon');
	});
	it('does not split catalog titles', () => {
		const id = trackIdentity({ title: 'Song - Remastered 2011', author: 'Band', sourceName: 'spotify' });
		expect(id.title).toBe('song remastered 2011');
		expect(id.artist).toBe('band');
	});
	it('makes MV and Topic uploads share a key', () => {
		const mv = trackIdentity({ title: 'Lemon (Official MV)', author: 'Kenshi Yonezu', sourceName: 'youtube' });
		const topic = trackIdentity({ title: 'Lemon', author: 'Kenshi Yonezu - Topic', sourceName: 'youtube' });
		expect(mv.recordingKey).toBe(topic.recordingKey);
	});
	it('has no key without artist or title', () => {
		expect(trackIdentity({ title: '', author: 'x' }).recordingKey).toBeNull();
	});
});

describe('durationMatches', () => {
	it('allows up to three seconds', () => {
		expect(durationMatches(255_000, 258_000)).toBe(true);
		expect(durationMatches(255_000, 258_001)).toBe(false);
		expect(durationMatches(0, 0)).toBe(false);
	});
});

describe('sourcePriority', () => {
	it('prefers catalog sources over YouTube', () => {
		expect(sourcePriority('spotify')).toBeGreaterThan(sourcePriority('youtubemusic'));
		expect(sourcePriority('youtubemusic')).toBeGreaterThan(sourcePriority('youtube'));
		expect(sourcePriority('youtube')).toBeGreaterThan(sourcePriority('soundcloud'));
	});
});
