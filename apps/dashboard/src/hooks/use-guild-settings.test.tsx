// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GuildSettings } from "@/types/settings";

import { useSettingsForm } from "./use-guild-settings";

const remote = vi.hoisted(() => ({ settings: null as GuildSettings | null, mutate: vi.fn() }));
vi.mock("swr", () => ({ default: () => ({ data: remote.settings, mutate: remote.mutate, isLoading: false }) }));
vi.mock("@/hooks/use-session-redirect", () => ({ useSessionExpiredRedirect: () => vi.fn() }));

const saved: GuildSettings = {
  volume: 100, repeat: "off", related: false, enableController: true,
  sponsorBlockSegments: ["sponsor", "intro"], djRoleId: null, textChannelId: null,
  voiceChannelId: null, pinnedChannelId: null, pinnedChannelMode: "play",
  pinnedChannelDeleteInput: false, jtcEnabled: false, jtcCategoryId: null,
  jtcMarkerChannelId: null, jtcTemplate: "{user}의 방", jtcUserLimit: 0,
  gaplessEnabled: false, crossfadeEnabled: false, crossfadeMs: 500,
};
const editable = (settings: GuildSettings) => ({ volume: settings.volume, sponsorBlockSegments: settings.sponsorBlockSegments });
let current: ReturnType<typeof useSettingsForm<ReturnType<typeof editable>>>;
let root: Root;
let element: HTMLDivElement;

function Probe() {
  const state = useSettingsForm("guild-a", editable);
  useEffect(() => { current = state; });
  return null;
}

async function render() {
  await act(async () => { root.render(<Probe />); });
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  remote.settings = saved;
  remote.mutate.mockReset();
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  await render();
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  element.remove();
  vi.unstubAllGlobals();
});

describe("settings draft integrity", () => {
  it("becomes clean when a scalar or ordered list returns to its saved value", async () => {
    await act(async () => { current.patch({ volume: 70 }); });
    expect(current.dirty).toBe(true);
    await act(async () => { current.patch({ volume: 100 }); });
    expect(current.dirty).toBe(false);
    await act(async () => { current.patch({ sponsorBlockSegments: ["intro", "sponsor"] }); });
    expect(current.dirty).toBe(true);
    await act(async () => { current.patch({ sponsorBlockSegments: ["sponsor", "intro"] }); });
    expect(current.dirty).toBe(false);
  });

  it("protects the draft and its original baseline from background revalidation", async () => {
    await act(async () => { current.patch({ volume: 70 }); });
    remote.settings = { ...saved, volume: 80 };
    await render();
    expect(current.form?.volume).toBe(70);
    await act(async () => { current.patch({ volume: 100 }); });
    expect(current.dirty).toBe(false);
  });

  it("sends one request for repeated submit and locks edits until completion", async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetch);
    await act(async () => { current.patch({ volume: 70 }); });
    let first!: Promise<GuildSettings | null>;
    let second!: Promise<GuildSettings | null>;
    await act(async () => { first = current.submit(); second = current.submit(); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(current.saving).toBe(true);
    await act(async () => { current.patch({ volume: 40 }); });
    expect(current.form?.volume).toBe(70);
    await act(async () => {
      resolve(Response.json({ ...saved, volume: 70 }));
      await Promise.all([first, second]);
    });
    expect(current.form?.volume).toBe(70);
    expect(current.dirty).toBe(false);
    expect(current.saving).toBe(false);
  });

  it("retains a failed draft and can retry without a false success", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 502 }))
      .mockResolvedValueOnce(Response.json({ ...saved, volume: 70 }));
    vi.stubGlobal("fetch", fetch);
    await act(async () => { current.patch({ volume: 70 }); });
    await act(async () => { await expect(current.submit()).rejects.toThrow("잠시 후 다시 시도해 주세요."); });
    expect(current.form?.volume).toBe(70);
    expect(current.dirty).toBe(true);
    expect(current.saving).toBe(false);
    await act(async () => { await current.submit(); });
    expect(current.dirty).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
