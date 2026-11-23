import { type LyricLine, parseLrc } from "@sirubot/utils/lrc";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";
import type { LyricsPayload } from "@/app/api/servers/[id]/lyrics/route";

/** 오프셋 조절 단위와 한계 — 가사가 어긋나는 정도는 보통 몇 초 안쪽이에요 */
export const LYRICS_OFFSET_STEP_MS = 500;
export const LYRICS_OFFSET_LIMIT_MS = 10_000;

export interface KaraokeLyrics {
  /** 싱크가 있으면 줄 목록, 없으면 일반 가사만 */
  synced: boolean;
  lines: LyricLine[];
  plainText: string;
  /** 단어 단위 하이라이트가 가능한지 */
  wordSync: boolean;
}

/** 서버 응답을 패널이 그릴 형태로 바꿔요 — 단어 싱크 > 줄 싱크 > 일반 가사 순이에요. */
export function toKaraokeLyrics(payload: LyricsPayload): KaraokeLyrics | null {
  const wordLines = payload.hasWordSync ? payload.wordSync : null;
  if (wordLines && wordLines.length > 0) {
    return {
      synced: true,
      lines: wordLines,
      plainText: payload.plainLyrics ?? "",
      wordSync: wordLines.some((line) => (line.words?.length ?? 0) > 0),
    };
  }
  const parsed = payload.syncedLyrics ? parseLrc(payload.syncedLyrics) : [];
  if (parsed.some((line) => line.text)) {
    return { synced: true, lines: parsed, plainText: payload.plainLyrics ?? "", wordSync: false };
  }
  const plain = payload.plainLyrics?.trim();
  if (plain) return { synced: false, lines: [], plainText: plain, wordSync: false };
  return null;
}

/** 번역 보기 방식 — 원문만, 번역만, 둘 다 */
export type LyricsViewMode = "original" | "translation" | "both";
export const LYRICS_VIEW_MODES: ReadonlyArray<{ value: LyricsViewMode; label: string }> = [
  { value: "original", label: "원문" },
  { value: "translation", label: "번역" },
  { value: "both", label: "둘 다" },
];

/** 번역 폴링 간격 — 서버가 뒤에서 번역하는 동안만 다시 물어봐요 */
export const LYRICS_TRANSLATION_POLL_MS = 5000;

/** 줄의 번역 — 번역이 없거나 원문과 같으면 null */
export function translatedLine(lines: Record<string, string> | null | undefined, text: string): string | null {
  const translated = lines?.[text.trim()];
  return translated && translated !== text.trim() ? translated : null;
}

const VIEW_STORAGE_KEY = "sirubot:lyrics-view";

export function readLyricsViewMode(): LyricsViewMode {
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return raw === "original" || raw === "translation" || raw === "both" ? raw : "both";
  } catch {
    return "both";
  }
}

export function writeLyricsViewMode(mode: LyricsViewMode): void {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, mode);
  } catch {
    // 저장은 편의 기능이라 조용히 넘어가요
  }
}

/** 가사를 찾을 수 있는 곡인지 — 스트림이나 제목 없는 상태는 건너뛰어요 */
export function lyricsEligible(state: LivePlayerState): boolean {
  return !state.isStream && Boolean(state.trackTitle);
}

/** 곡 식별 키 — 같은 곡이면 가사를 다시 받지 않고, 오프셋 저장 키로도 써요 */
export function lyricsTrackKey(state: LivePlayerState): string {
  return `${state.trackUri || state.trackTitle || ""}|${Math.round(state.durationMs / 1000)}`;
}

/** 가사 조회 경로 (`/api/servers/:id` 뒤에 붙여요) */
export function lyricsQueryPath(state: LivePlayerState): string | null {
  if (!lyricsEligible(state)) return null;
  const params = new URLSearchParams({
    title: state.trackTitle ?? "",
    artist: state.trackAuthor ?? "",
    durationMs: String(Math.max(0, Math.round(state.durationMs))),
  });
  if (state.sourceName) params.set("source", state.sourceName);
  return `/lyrics?${params}`;
}

export function clampLyricsOffset(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  const stepped = Math.round(ms / LYRICS_OFFSET_STEP_MS) * LYRICS_OFFSET_STEP_MS;
  return Math.max(-LYRICS_OFFSET_LIMIT_MS, Math.min(LYRICS_OFFSET_LIMIT_MS, stepped));
}

const OFFSET_STORAGE_PREFIX = "sirubot:lyrics-offset:";

/** 곡별 오프셋 읽기 — 저장소를 못 쓰면(비공개 창·차단) 0이에요 */
export function readLyricsOffset(trackKey: string): number {
  try {
    const raw = window.localStorage.getItem(OFFSET_STORAGE_PREFIX + trackKey);
    return raw === null ? 0 : clampLyricsOffset(Number(raw));
  } catch {
    return 0;
  }
}

/** 곡별 오프셋 저장 — 0이면 키를 지워요. 실패해도 화면에는 영향이 없어요. */
export function writeLyricsOffset(trackKey: string, offsetMs: number): void {
  try {
    if (offsetMs === 0) window.localStorage.removeItem(OFFSET_STORAGE_PREFIX + trackKey);
    else window.localStorage.setItem(OFFSET_STORAGE_PREFIX + trackKey, String(offsetMs));
  } catch {
    // 저장은 편의 기능이라 조용히 넘어가요
  }
}

/** 오프셋 표시 — `+0.5초`, `-1초`, `0초` */
export function formatLyricsOffset(offsetMs: number): string {
  if (offsetMs === 0) return "0초";
  const seconds = offsetMs / 1000;
  return `${seconds > 0 ? "+" : ""}${seconds}초`;
}
