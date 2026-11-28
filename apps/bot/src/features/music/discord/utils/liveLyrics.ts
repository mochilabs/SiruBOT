import { findActiveLineIndex, parseLrc, type LyricLine } from '@sirubot/utils/lrc';

// 메시지 수정이 Discord에 닿기까지 걸리는 시간만큼 앞서 줄을 넘겨요.
export const LIVE_LEAD_MS = 300;
/** 수정 사이 최소 간격 — 채널당 수정 횟수 제한(대략 5초에 5회)을 넘지 않게 해요 */
export const LIVE_MIN_EDIT_GAP_MS = 1_500;
export const LIVE_TICK_MS = 500;

export function parseLiveLines(syncedLyrics: string | null | undefined): LyricLine[] | null {
	if (!syncedLyrics) return null;
	const lines = parseLrc(syncedLyrics);
	return lines.filter((line) => line.text).length >= 2 ? lines : null;
}

const textOf = (line: LyricLine | undefined) => (line ? line.text || '♪' : null);

export function buildLiveLyricsText(lines: ReadonlyArray<LyricLine>, index: number, translation: Record<string, string> | null): string {
	const parts: string[] = [];
	const addTranslation = (line: LyricLine | undefined) => {
		const translated = line?.text ? translation?.[line.text] : null;
		if (translated && translated !== line?.text) parts.push(`-# ${translated}`);
	};
	const prev = index > 0 ? lines[index - 1] : undefined;
	if (prev) {
		parts.push(`-# ${textOf(prev)}`);
		addTranslation(prev);
	}
	if (index < 0) parts.push('-# 곧 시작해요');
	else {
		parts.push(`**▶ ${textOf(lines[index])}**`);
		addTranslation(lines[index]);
	}
	const next = lines[index + 1];
	if (next) {
		parts.push(textOf(next)!);
		addTranslation(next);
	}
	return parts.join('\n');
}

export type LiveEndReason = 'user' | 'track' | 'error';

export interface LiveLoopOptions {
	lines: ReadonlyArray<LyricLine>;
	// 번역은 뒤늦게 준비될 수 있어서 줄을 그릴 때마다 최신 값을 물어봐요.
	getTranslation: () => Record<string, string> | null;
	getPositionMs: () => number | null;
	isSameTrack: () => boolean;
	render: (text: string) => Promise<void>;
	onEnd: (reason: LiveEndReason) => void | Promise<void>;
}

export function startLiveLoop(options: LiveLoopOptions): (reason?: LiveEndReason) => void {
	let lastIndex = Number.NaN;
	let lastEditAt = 0;
	let busy = false;
	let ended = false;

	const end = (reason: LiveEndReason) => {
		if (ended) return;
		ended = true;
		clearInterval(timer);
		void Promise.resolve(options.onEnd(reason)).catch(() => null);
	};

	const tick = async () => {
		if (ended || busy) return;
		const position = options.getPositionMs();
		if (position === null || !options.isSameTrack()) return end('track');
		const index = findActiveLineIndex(options.lines, position + LIVE_LEAD_MS);
		if (index === lastIndex || Date.now() - lastEditAt < LIVE_MIN_EDIT_GAP_MS) return;
		busy = true;
		try {
			await options.render(buildLiveLyricsText(options.lines, index, options.getTranslation()));
			lastIndex = index;
			lastEditAt = Date.now();
		} catch {
			end('error');
		} finally {
			busy = false;
		}
	};

	const timer = setInterval(() => void tick(), LIVE_TICK_MS);
	void tick();
	return (reason = 'user') => end(reason);
}
