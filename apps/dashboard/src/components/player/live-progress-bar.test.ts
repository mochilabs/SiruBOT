import { afterEach, describe, expect, it, vi } from "vitest";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";

import { interpolatedPositionMs } from "./live-progress-bar";

const state = (overrides: Partial<LivePlayerState> = {}): LivePlayerState => ({
  guildId: "guild-a",
  playing: true,
  paused: false,
  volume: 100,
  repeatMode: "off",
  trackTitle: "곡",
  trackAuthor: "아티스트",
  artworkUrl: null,
  durationMs: 180000,
  positionMs: 10000,
  isStream: false,
  sourceName: null,
  requesterName: null,
  queueLength: 0,
  queue: [],
  updatedAt: 1700000000000,
  ageMs: 0,
  stale: false,
  ...overrides,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("interpolatedPositionMs", () => {
  it("라이브 스트림과 길이 미상은 스냅샷 위치를 그대로 써요", () => {
    expect(interpolatedPositionMs(state({ isStream: true }), 1)).toBe(10000);
    expect(interpolatedPositionMs(state({ durationMs: 0 }), 1)).toBe(10000);
  });

  it("일시정지·중지·불안정 스냅샷은 위치를 밀지 않아요", () => {
    expect(interpolatedPositionMs(state({ paused: true }), 1)).toBe(10000);
    expect(interpolatedPositionMs(state({ playing: false }), 1)).toBe(10000);
    expect(interpolatedPositionMs(state({ stale: true }), 1)).toBe(10000);
  });

  it("재생 중에는 스냅샷 이후 경과 시간을 더하고, 미래 수신 시각이나 길이를 넘지 않아요", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
    expect(interpolatedPositionMs(state(), 995000)).toBe(15000);
    expect(interpolatedPositionMs(state(), 1060000)).toBe(10000);
    expect(interpolatedPositionMs(state(), -999000000)).toBe(180000);
  });
});
