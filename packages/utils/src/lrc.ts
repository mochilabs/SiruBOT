/** `text` keeps its trailing whitespace. */
export interface LyricWord {
	startMs: number;
	text: string;
}

export interface LyricLine {
	startMs: number;
	text: string;
	endMs?: number | null;
	words?: LyricWord[];
}

const TIMESTAMP = /^(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?$/;
const OFFSET_TAG = /^offset\s*:\s*([+-]?\d+)$/i;
const LEADING_TAGS = /^(?:\s*\[[^\]]*\])+/;
const TAG = /\[([^\]]*)\]/g;
const INLINE_WORD_TIME = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

function timestampMs(token: string): number | null {
	const match = TIMESTAMP.exec(token.trim());
	if (!match) return null;
	const minutes = Number(match[1]);
	const seconds = Number(match[2]);
	if (seconds >= 60) return null;
	// the fraction is read as a decimal regardless of digit count (`.5` = `.50` = `.500` = 500ms)
	const fraction = match[3] ? Number(match[3].padEnd(3, '0')) : 0;
	return (minutes * 60 + seconds) * 1000 + fraction;
}

/**
 * - Several timestamps on one line (`[00:10.00][01:20.00]후렴`) yield one line each.
 * - Tag lines (`[ar:]`, `[ti:]`) and lines without a time are ignored.
 * - A positive `[offset:±ms]` shows lyrics earlier (subtracted from the time), per LRC convention.
 * - Empty lyric lines (interludes) are kept: they mark when the previous line ends.
 */
export function parseLrc(raw: string): LyricLine[] {
	let offsetMs = 0;
	const lines: LyricLine[] = [];
	for (const rawLine of raw.split(/\r?\n/)) {
		const head = LEADING_TAGS.exec(rawLine);
		if (!head) continue;
		const timestamps: number[] = [];
		for (const tag of head[0].matchAll(TAG)) {
			const body = tag[1] ?? '';
			const time = timestampMs(body);
			if (time !== null) {
				timestamps.push(time);
				continue;
			}
			const offset = OFFSET_TAG.exec(body.trim());
			if (offset) offsetMs = Number(offset[1]);
		}
		if (timestamps.length === 0) continue;
		const text = rawLine.slice(head[0].length).replace(INLINE_WORD_TIME, '').trim();
		for (const startMs of timestamps) lines.push({ startMs, text });
	}
	const shifted = offsetMs === 0 ? lines : lines.map((line) => ({ ...line, startMs: Math.max(0, line.startMs - offsetMs) }));
	// the sort is stable, so equal times keep input order
	return shifted.sort((a, b) => a.startMs - b.startMs);
}

/** `startMs`가 positionMs 이하인 마지막 항목의 인덱스 (이진 탐색) — 첫 항목 전이면 -1이에요. 입력은 startMs 오름차순이어야 해요. */
function lastStartedIndex(items: ReadonlyArray<{ startMs: number }>, positionMs: number): number {
	let low = 0;
	let high = items.length - 1;
	let found = -1;
	while (low <= high) {
		const mid = (low + high) >> 1;
		if (items[mid]!.startMs <= positionMs) {
			found = mid;
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}
	return found;
}

/** 지금 위치에서 하이라이트할 줄 — 첫 줄이 시작하기 전이면 -1이에요. */
export function findActiveLineIndex(lines: ReadonlyArray<LyricLine>, positionMs: number): number {
	return lastStartedIndex(lines, positionMs);
}

/** 지금 위치에서 하이라이트할 단어 — 첫 단어 전이면 -1이에요. */
export function findActiveWordIndex(words: ReadonlyArray<LyricWord>, positionMs: number): number {
	return lastStartedIndex(words, positionMs);
}
