import { describe, expect, it, vi } from 'vitest';

const { readFileMock } = vi.hoisted(() => ({ readFileMock: vi.fn() }));
vi.mock('node:fs/promises', () => ({ readFile: readFileMock }));

async function flushMicrotasks(): Promise<void> {
	for (let i = 0; i < 50; i++) await Promise.resolve();
}

describe('app emoji id map', () => {
	it('keeps cached ids when a later sync returns a partial map and prefers refreshed ids', async () => {
		vi.resetModules();
		const { emoji, setAppEmojiIdMap } = await import('./appEmoji.ts');

		setAppEmojiIdMap({ pause: 'old-pause', play: 'cached-play' });
		setAppEmojiIdMap({ pause: 'new-pause' });

		expect(emoji('pause')).toBe('<:pause:new-pause>');
		expect(emoji('play')).toBe('<:play:cached-play>');
	});

	it('이모지 이름 규칙에 안 맞는 매핑은 폴백으로 방어해요', async () => {
		vi.resetModules();
		const { emoji, setAppEmojiIdMap } = await import('./appEmoji.ts');

		setAppEmojiIdMap({ 'bad name': '999', a: '1' });

		expect(emoji('bad name', '(폴백)')).toBe('(폴백)');
		expect(emoji('a', '(폴백)')).toBe('(폴백)');
	});
});

describe('app emoji load contract', () => {
	it('빈 매핑은 캐시하지 않고 loadPromise를 리셋한 뒤 30초 재시도를 한 번만 예약해요', async () => {
		vi.useFakeTimers();
		vi.resetModules();
		readFileMock.mockReset();
		readFileMock.mockRejectedValue(new Error('ENOENT'));
		try {
			const { emoji, ensureAppEmojisLoaded } = await import('./appEmoji.ts');

			await ensureAppEmojisLoaded();
			// 빈 결과는 캐시되지 않아 유니코드 폴백이 그대로 나와요
			expect(emoji('pause')).toBe('⏸️');
			expect(vi.getTimerCount()).toBe(1);

			// loadPromise가 리셋됐다는 증거: 다음 호출이 파일을 다시 읽어요
			const callsAfterFirstLoad = readFileMock.mock.calls.length;
			await ensureAppEmojisLoaded();
			expect(readFileMock.mock.calls.length).toBeGreaterThan(callsAfterFirstLoad);
			// 중복 예약은 없어요
			expect(vi.getTimerCount()).toBe(1);

			// 30초 뒤 예약 재시도가 실제로 다시 로드를 시도해요
			const callsBeforeTimer = readFileMock.mock.calls.length;
			await vi.advanceTimersByTimeAsync(30_000);
			await flushMicrotasks();
			expect(readFileMock.mock.calls.length).toBeGreaterThan(callsBeforeTimer);

			// 두 번째 예약은 없으므로 이후에는 재시도가 더 이상 없어요
			const callsAfterRetry = readFileMock.mock.calls.length;
			await vi.advanceTimersByTimeAsync(60_000);
			await flushMicrotasks();
			expect(readFileMock.mock.calls.length).toBe(callsAfterRetry);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});
