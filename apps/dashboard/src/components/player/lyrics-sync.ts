import { type LyricLine, parseLrc } from "@sirubot/utils/lrc";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";
import type { LyricsPayload } from "@/app/api/servers/[id]/lyrics/route";

export interface KaraokeLyrics {
  /** 싱크가 있으면 줄 목록, 없으면 일반 가사만 */
  synced: boolean;
  lines: LyricLine[];
  plainText: string;
}

/** 서버 응답을 패널이 그릴 형태로 바꿔요 — 줄 단위만 써요(봇과 같은 재생이라 단어 단위는 맞추기 어려워요). 줄 싱크가 없으면 단어 싱크의 줄 시작 시각을 써요. */
export function toKaraokeLyrics(payload: LyricsPayload): KaraokeLyrics | null {
  const plainText = payload.plainLyrics ?? "";
  const parsed = payload.syncedLyrics ? parseLrc(payload.syncedLyrics) : [];
  if (parsed.some((line) => line.text)) return { synced: true, lines: parsed, plainText };
  const wordLines = payload.hasWordSync ? (payload.wordSync ?? []) : [];
  const lines: LyricLine[] = wordLines.map((line) => ({ startMs: line.startMs, text: line.text, endMs: line.endMs }));
  if (lines.some((line) => line.text)) return { synced: true, lines, plainText };
  const plain = payload.plainLyrics?.trim();
  if (plain) return { synced: false, lines: [], plainText: plain };
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

/** 유튜브 곡이면 trackUri에서 영상 ID를 뽑아요 — 업로더 자막 폴백에 써요. */
export function youtubeVideoId(state: Pick<LivePlayerState, "sourceName" | "trackUri">): string | null {
  if (!state.sourceName?.startsWith("youtube") || !state.trackUri) return null;
  const match = /(?:[?&]v=|youtu\.be\/|\/shorts\/)([\w-]{11})(?![\w-])/.exec(state.trackUri);
  return match?.[1] ?? null;
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
  const videoId = youtubeVideoId(state);
  if (videoId) params.set("videoId", videoId);
  return `/lyrics?${params}`;
}
