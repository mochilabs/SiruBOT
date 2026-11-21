// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";

import {
  clampLyricsOffset,
  formatLyricsOffset,
  lyricsEligible,
  lyricsQueryPath,
  readLyricsOffset,
  toKaraokeLyrics,
  writeLyricsOffset,
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
  it("prefers word sync lines", () => {
    const lyrics = toKaraokeLyrics({
      ...base,
      hasWordSync: true,
      syncedLyrics: "[00:01.00] a",
      wordSync: [{ startMs: 900, text: "a b", words: [{ startMs: 900, text: "a " }, { startMs: 1200, text: "b" }] }],
    });
    expect(lyrics).toMatchObject({ synced: true, wordSync: true });
    expect(lyrics?.lines[0]?.startMs).toBe(900);
  });

  it("falls back to LRC lines, then plain text, then null", () => {
    expect(toKaraokeLyrics({ ...base, syncedLyrics: "[00:01.00] a\n[00:02.00] b" })).toMatchObject({ synced: true, wordSync: false });
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

describe("offset", () => {
  it("clamps and snaps to 0.5s steps", () => {
    expect(clampLyricsOffset(700)).toBe(500);
    expect(clampLyricsOffset(99_999)).toBe(10_000);
    expect(clampLyricsOffset(-99_999)).toBe(-10_000);
    expect(clampLyricsOffset(Number.NaN)).toBe(0);
  });

  it("formats", () => {
    expect(formatLyricsOffset(0)).toBe("0초");
    expect(formatLyricsOffset(500)).toBe("+0.5초");
    expect(formatLyricsOffset(-1000)).toBe("-1초");
  });

  it("persists per track and removes the key at zero", () => {
    writeLyricsOffset("k", 1500);
    expect(readLyricsOffset("k")).toBe(1500);
    expect(readLyricsOffset("other")).toBe(0);
    writeLyricsOffset("k", 0);
    expect(window.localStorage.getItem("sirubot:lyrics-offset:k")).toBeNull();
  });

  it("survives a throwing localStorage", () => {
    const broken = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    vi.stubGlobal("localStorage", broken);
    expect(readLyricsOffset("k")).toBe(0);
    expect(() => writeLyricsOffset("k", 500)).not.toThrow();
  });
});
