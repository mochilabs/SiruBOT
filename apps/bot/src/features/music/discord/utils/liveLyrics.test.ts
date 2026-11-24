import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLiveLyricsText, LIVE_LEAD_MS, parseLiveLines, startLiveLoop } from './liveLyrics.ts';

const LRC = '[00:01.00]one\n[00:05.00]two\n[00:09.00]\n[00:12.00]three\n[00:16.00]four';

describe('parseLiveLines', () => {
	it('needs at least two lyric lines', () => {
		expect(parseLiveLines(LRC)).toHaveLength(5);
		expect(parseLiveLines('[00:01.00]only')).toBeNull();
		expect(parseLiveLines(null)).toBeNull();
	});
});

describe('buildLiveLyricsText', () => {
	const lines = parseLiveLines(LRC)!;

	it('marks the current line with the previous and next lines around it', () => {
		expect(buildLiveLyricsText(lines, 1, null)).toBe('-# one\n**▶ two**\n♪\nthree');
	});

	it('adds the translation under the current line', () => {
		expect(buildLiveLyricsText(lines, 1, { two: '둘' })).toBe('-# one\n**▶ two**\n-# 둘\n♪\nthree');
	});

	it('previews the first lines before the song reaches them', () => {
		expect(buildLiveLyricsText(lines, -1, null)).toBe('-# 곧 시작해요\none\ntwo\n♪');
	});

	it('stops at the end of the lyrics', () => {
		expect(buildLiveLyricsText(lines, 4, null)).toBe('-# three\n**▶ four**');
	});
});

describe('startLiveLoop', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	const make = (over: Partial<Parameters<typeof startLiveLoop>[0]> = {}) => {
		let position: number | null = 0;
		const render = vi.fn(async () => undefined);
		const onEnd = vi.fn();
		const stop = startLiveLoop({
			lines: parseLiveLines(LRC)!,
			translation: null,
			getPositionMs: () => position,
			isSameTrack: () => true,
			render,
			onEnd,
			...over
		});
		return { render, onEnd, stop, setPosition: (p: number | null) => (position = p) };
	};

	it('edits only when the line changes and respects the minimum gap', async () => {
		const { render, setPosition, stop } = make();
		await vi.advanceTimersByTimeAsync(0);
		expect(render).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1000);
		expect(render).toHaveBeenCalledTimes(1);
		setPosition(5000 - LIVE_LEAD_MS);
		await vi.advanceTimersByTimeAsync(600);
		expect(render).toHaveBeenCalledTimes(2);
		stop();
	});

	it('ends when the track changes', async () => {
		let same = true;
		const { onEnd } = make({ isSameTrack: () => same });
		await vi.advanceTimersByTimeAsync(0);
		same = false;
		await vi.advanceTimersByTimeAsync(600);
		expect(onEnd).toHaveBeenCalledWith('track');
		expect(onEnd).toHaveBeenCalledTimes(1);
	});

	it('ends with error when the edit is rejected', async () => {
		const { onEnd } = make({ render: vi.fn().mockRejectedValue(new Error('Unknown Message')) });
		await vi.advanceTimersByTimeAsync(0);
		expect(onEnd).toHaveBeenCalledWith('error');
	});

	it('stop ends once with the given reason', async () => {
		const { onEnd, stop } = make();
		stop('user');
		stop('user');
		expect(onEnd).toHaveBeenCalledTimes(1);
		expect(onEnd).toHaveBeenCalledWith('user');
	});
});
