import { type LyricLine, parseLrc } from "@sirubot/utils/lrc";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";
import type { LyricsPayload } from "@/app/api/servers/[id]/lyrics/route";

export interface KaraokeLyrics {
  synced: boolean;
  lines: LyricLine[];
  plainText: string;
}

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

export type LyricsViewMode = "original" | "translation" | "both";
export const LYRICS_VIEW_MODES: ReadonlyArray<{ value: LyricsViewMode; label: string }> = [
  { value: "original", label: "원문" },
  { value: "translation", label: "번역" },
  { value: "both", label: "둘 다" },
];

export const LYRICS_TRANSLATION_POLL_MS = 5000;

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
  }
}

export function lyricsEligible(state: LivePlayerState): boolean {
  return !state.isStream && Boolean(state.trackTitle);
}

export function lyricsTrackKey(state: LivePlayerState): string {
  return `${state.trackUri || state.trackTitle || ""}|${Math.round(state.durationMs / 1000)}`;
}

export function youtubeVideoId(state: Pick<LivePlayerState, "sourceName" | "trackUri">): string | null {
  if (!state.sourceName?.startsWith("youtube") || !state.trackUri) return null;
  const match = /(?:[?&]v=|youtu\.be\/|\/shorts\/)([\w-]{11})(?![\w-])/.exec(state.trackUri);
  return match?.[1] ?? null;
}

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
