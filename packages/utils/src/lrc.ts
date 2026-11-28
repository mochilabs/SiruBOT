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
	// LRC fraction is always decimal (.5 = 500ms).
	const fraction = match[3] ? Number(match[3].padEnd(3, '0')) : 0;
	return (minutes * 60 + seconds) * 1000 + fraction;
}

// Positive [offset:±ms] shifts lyrics earlier per LRC convention.
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
	return shifted.sort((a, b) => a.startMs - b.startMs);
}

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

export function findActiveLineIndex(lines: ReadonlyArray<LyricLine>, positionMs: number): number {
	return lastStartedIndex(lines, positionMs);
}

export function findActiveWordIndex(words: ReadonlyArray<LyricWord>, positionMs: number): number {
	return lastStartedIndex(words, positionMs);
}
