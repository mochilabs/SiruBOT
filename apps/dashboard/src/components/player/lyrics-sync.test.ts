// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";

import {
  lyricsEligible,
  lyricsQueryPath,
  toKaraokeLyrics,
} from "./lyrics-sync";

const base = { trackName: "t", artistName: "a", plainLyrics: null, syncedLyrics: null };
const state = (overrides: Partial<LivePlayerState> = {}): LivePlayerState =>
  ({
    guildId: "g", playing: true, paused: false, volume: 100, repeatMode: "off",
    trackTitle: "Ditto", trackAuthor: "NewJeans", artworkUrl: null, trackUri: "https://x/y",
    durationMs: 186000, positionMs: 0, isStream: false, sourceName: "youtube",
    requesterName: null, queueLength: 0, queue: [], updatedAt: 0, ageMs: 0, stale: false,
    ...overrides,
  }) as LivePlayerState;

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("toKaraokeLyrics", () => {
  it("uses LRC lines even when word sync exists", () => {
    const lyrics = toKaraokeLyrics({
      ...base,
      hasWordSync: true,
      syncedLyrics: "[00:01.00] a",
      wordSync: [{ startMs: 900, text: "a b", words: [{ startMs: 900, text: "a " }, { startMs: 1200, text: "b" }] }],
    });
    expect(lyrics?.lines).toEqual([{ startMs: 1000, text: "a" }]);
    expect(lyrics?.lines[0]?.words).toBeUndefined();
  });

  it("falls back to the line starts of word sync when there is no LRC", () => {
    const lyrics = toKaraokeLyrics({ ...base, hasWordSync: true, wordSync: [{ startMs: 900, text: "a b", words: [{ startMs: 900, text: "a b" }] }] });
    expect(lyrics?.lines).toEqual([{ startMs: 900, text: "a b", endMs: undefined }]);
  });

  it("falls back to LRC lines, then plain text, then null", () => {
    expect(toKaraokeLyrics({ ...base, syncedLyrics: "[00:01.00] a\n[00:02.00] b" })).toMatchObject({ synced: true });
    expect(toKaraokeLyrics({ ...base, plainLyrics: " 그냥 가사 " })).toMatchObject({ synced: false, plainText: "그냥 가사" });
    expect(toKaraokeLyrics({ ...base, syncedLyrics: "[ar:x]" })).toBeNull();
  });
});

describe("lyrics query", () => {
  it("builds the query from the playing track and skips streams", () => {
    const params = new URLSearchParams(lyricsQueryPath(state())!.split("?")[1]);
    expect(params.get("title")).toBe("Ditto");
    expect(params.get("artist")).toBe("NewJeans");
    expect(params.get("durationMs")).toBe("186000");
    expect(params.get("source")).toBe("youtube");
    expect(lyricsQueryPath(state({ isStream: true }))).toBeNull();
    expect(lyricsEligible(state({ trackTitle: null }))).toBe(false);
  });
});
