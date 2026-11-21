/**
 * LRC 싱크 가사 파서와 재생 위치 조회 — 대시보드 노래방 가사 패널과 data-api가 같이 써요.
 * 순수 모듈이라 클라이언트 번들에서도 쓸 수 있어요 (서브패스 `@sirubot/utils/lrc`).
 */

/** 단어 단위 싱크의 한 단어 — `text`에는 뒤따르는 공백이 그대로 들어 있어요. */
export interface LyricWord {
	startMs: number;
	text: string;
}

/** 싱크된 가사 한 줄. 단어 싱크가 있는 곡만 `words`가 있어요. */
export interface LyricLine {
	startMs: number;
	text: string;
	/** 줄 끝 시각 — 알 수 없으면 생략해요. */
	endMs?: number | null;
	words?: LyricWord[];
}

const TIMESTAMP = /^(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?$/;
const OFFSET_TAG = /^offset\s*:\s*([+-]?\d+)$/i;
const LEADING_TAGS = /^(?:\s*\[[^\]]*\])+/;
const TAG = /\[([^\]]*)\]/g;
/** Enhanced LRC의 단어 시각 `<00:12.34>` */
const INLINE_WORD_TIME = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

function timestampMs(token: string): number | null {
	const match = TIMESTAMP.exec(token.trim());
	if (!match) return null;
	const minutes = Number(match[1]);
	const seconds = Number(match[2]);
	if (seconds >= 60) return null;
	// 소수부는 자릿수와 상관없이 소수로 읽어요 (`.5` = 500ms, `.50` = 500ms, `.500` = 500ms)
	const fraction = match[3] ? Number(match[3].padEnd(3, '0')) : 0;
	return (minutes * 60 + seconds) * 1000 + fraction;
}

/**
 * LRC 본문을 시간순 줄 목록으로 바꿔요.
 * - 한 줄에 타임스탬프가 여러 개(`[00:10.00][01:20.00]후렴`)면 줄을 각각 만들어요.
 * - `[ar:]`·`[ti:]` 같은 태그 줄과 시각이 없는 줄은 무시해요.
 * - `[offset:±ms]`는 양수면 가사가 빨리 나오도록(시각에서 빼서) 적용해요 (LRC 관례).
 * - 빈 가사 줄(간주)도 남겨요 — 앞 줄이 끝나는 시점을 알려 줘요.
 * - 같은 시각의 줄은 입력 순서를 지켜요.
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
	// 정렬은 안정적이라 같은 시각은 입력 순서가 유지돼요
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
