import { findActiveLineIndex, parseLrc, type LyricLine } from '@sirubot/utils/lrc';

/** 메시지 수정이 Discord에 닿기까지 걸리는 시간을 감안해 이만큼 앞서 줄을 넘겨요 */
export const LIVE_LEAD_MS = 700;
/** 수정 사이 최소 간격 — 채널당 수정 횟수 제한(대략 5초에 5회)을 넘지 않게 해요 */
export const LIVE_MIN_EDIT_GAP_MS = 1_500;
/** 재생 위치를 확인하는 주기 */
export const LIVE_TICK_MS = 500;

/** 실시간으로 넘길 수 있는 줄 싱크 가사인지 — 가사 줄이 둘 이상이어야 해요. */
export function parseLiveLines(syncedLyrics: string | null | undefined): LyricLine[] | null {
	if (!syncedLyrics) return null;
	const lines = parseLrc(syncedLyrics);
	return lines.filter((line) => line.text).length >= 2 ? lines : null;
}

const textOf = (line: LyricLine | undefined) => (line ? line.text || '♪' : null);

/**
 * 이전 줄, 현재 줄, 다음 줄만 보여줘요. 번역이 있으면 줄마다 아래에 작게 붙어요.
 * 이전 줄은 작게, 현재 줄은 굵게(`▶`)예요. 첫 줄 전(index -1)에는 첫 줄만 미리 보여줘요.
 */
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
	translation: Record<string, string> | null;
	/** 재생 위치(ms). 플레이어가 없으면 null */
	getPositionMs: () => number | null;
	/** 처음 시작한 곡이 아직 재생 중인지 */
	isSameTrack: () => boolean;
	/** 가사 메시지를 새 본문으로 고쳐요. 거부되면(메시지 삭제 등) 실시간을 멈춰요. */
	render: (text: string) => Promise<void>;
	/** 끝날 때 한 번만 불려요 */
	onEnd: (reason: LiveEndReason) => void | Promise<void>;
}

/** 재생 위치를 지켜보다 줄이 바뀔 때만 메시지를 고쳐요. 돌려주는 함수로 멈춰요. */
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
			await options.render(buildLiveLyricsText(options.lines, index, options.translation));
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
