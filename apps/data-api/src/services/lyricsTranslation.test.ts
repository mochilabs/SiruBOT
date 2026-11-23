import { describe, expect, it, vi } from 'vitest';
import { collectLyricLines, isMostlyKorean, LyricsTranslator, lyricsSourceHash, parseLineTranslations } from './lyricsTranslation.ts';

const lyrics = {
	plainLyrics: 'Hello world\n\nHello world\nさよなら',
	syncedLyrics: '[00:01.00]Hello world\n[00:03.00]さよなら\n[00:05.00]',
	wordSync: null,
	trackName: 't',
	artistName: 'a'
};

describe('collectLyricLines', () => {
	it('merges unique non-empty lines across sources', () => {
		expect(collectLyricLines(lyrics)).toEqual(['Hello world', 'さよなら']);
	});
});

describe('isMostlyKorean', () => {
	it('detects Korean lyrics', () => {
		expect(isMostlyKorean(['안녕', '사랑해', 'oh'])).toBe(true);
		expect(isMostlyKorean(['Hello', 'さよなら', '안녕'])).toBe(false);
	});
});

describe('parseLineTranslations', () => {
	it('strips fences and drops out-of-range indexes', () => {
		const out = parseLineTranslations('```json\n{"items":[{"i":0,"t":"안녕"},{"i":9,"t":"x"}]}\n```', 2);
		expect([...out!]).toEqual([[0, '안녕']]);
	});
	it('returns null for bad output', () => {
		expect(parseLineTranslations('nope', 2)).toBeNull();
	});
});

describe('LyricsTranslator', () => {
	it('starts a background job, stores it, then serves ready', async () => {
		const store = new Map<string, unknown>();
		const db = {
			lyricsTranslation: {
				findUnique: vi.fn(async ({ where }: { where: { sourceHash: string } }) => store.get(where.sourceHash) ?? null),
				upsert: vi.fn(async ({ create }: { create: { sourceHash: string } }) => void store.set(create.sourceHash, create))
			}
		};
		const provider = {
			available: true,
			model: 'm',
			chatCompletion: vi.fn(async () => '{"items":[{"i":0,"t":"안녕 세상"},{"i":1,"t":"안녕히"}]}')
		};
		const translator = new LyricsTranslator(() => db as never, provider);
		expect((await translator.lookup(lyrics)).status).toBe('pending');
		await vi.waitFor(() => expect(db.lyricsTranslation.upsert).toHaveBeenCalled());
		const ready = await translator.lookup(lyrics);
		expect(ready.status).toBe('ready');
		expect(store.has(lyricsSourceHash(['Hello world', 'さよなら']))).toBe(true);
		expect(provider.chatCompletion).toHaveBeenCalledTimes(1);
	});

	it('does nothing without a key', async () => {
		const translator = new LyricsTranslator(() => ({}) as never, { available: false, model: 'm', chatCompletion: vi.fn() });
		expect(await translator.lookup(lyrics)).toEqual({ status: 'none', lines: null });
	});
});
