// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";

import PlayerLiveTab from "./player-live-tab";

const remote = vi.hoisted(() => ({ data: undefined as unknown, error: null as Error | null, mutate: vi.fn() }));
vi.mock("swr", () => ({ default: () => ({ ...remote, isLoading: !remote.data && !remote.error }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/servers/guild-a" }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ error: vi.fn() }) }));

class Source {
  static instances: Source[] = [];
  listeners = new Map<string, (event: MessageEvent) => void>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string) { Source.instances.push(this); }
  addEventListener(type: string, listener: (event: MessageEvent) => void) { this.listeners.set(type, listener); }
  emit(data: unknown) { this.listeners.get("state")?.(new MessageEvent("state", { data: JSON.stringify(data) })); }
}

const player: LivePlayerState = {
  guildId: "guild-a", playing: true, paused: false, volume: 100, repeatMode: "off",
  trackTitle: "서버 A의 곡", trackAuthor: "아티스트", artworkUrl: null,
  durationMs: 180000, positionMs: 10000, isStream: false, sourceName: null,
  requesterName: null, queueLength: 0, queue: [], updatedAt: Date.now(), ageMs: 0, stale: false,
};
const snapshot = (state = player) => ({ player: state, hub: { guilds: 1, subscribed: true, staleMs: 10000 } });
let root: Root;
let element: HTMLDivElement;
async function render(guildId = "guild-a") {
  await act(async () => { root.render(<PlayerLiveTab guildId={guildId} />); });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("EventSource", Source);
  remote.data = undefined;
  remote.error = null;
  remote.mutate.mockReset();
  Source.instances = [];
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  element.remove();
  vi.unstubAllGlobals();
});

describe("live player context and recovery", () => {
  it("shows the HTTP snapshot while the first stream event is pending", async () => {
    remote.data = snapshot();
    await render();
    expect(element.textContent).toContain("서버 A의 곡");
  });

  it("clears old guild state and ignores queued events from the closed stream", async () => {
    await render();
    const old = Source.instances[0];
    await act(async () => { old.emit(snapshot()); });
    expect(element.textContent).toContain("서버 A의 곡");
    await render("guild-b");
    expect(old.close).toHaveBeenCalledOnce();
    expect(element.textContent).not.toContain("서버 A의 곡");
    await act(async () => { old.emit(snapshot()); });
    expect(element.textContent).not.toContain("서버 A의 곡");
  });

  it("provides a working retry action for an initial HTTP error", async () => {
    remote.error = new Error("offline");
    await render();
    expect(element.textContent).toContain("라이브 상태를 불러오지 못했어요");
    const retry = [...element.querySelectorAll("button")].find((button) => button.textContent === "다시 시도");
    expect(retry).toBeDefined();
    await act(async () => { retry?.click(); });
    expect(remote.mutate).toHaveBeenCalledOnce();
  });

  it("disables commands for a stale snapshot and labels the queue as uncertain", async () => {
    await render();
    await act(async () => { Source.instances[0].emit(snapshot({ ...player, stale: true })); });
    expect(element.querySelector('button[aria-label="일시정지"]')?.hasAttribute("disabled")).toBe(true);
    expect(element.textContent).toContain("마지막으로 확인한 재생 정보");
  });

  it("does not show pause as confirmed before a new snapshot arrives", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
    await render();
    await act(async () => { Source.instances[0].emit(snapshot()); });
    await act(async () => { element.querySelector<HTMLButtonElement>('button[aria-label="일시정지"]')?.click(); });
    expect(element.querySelector('button[aria-label="일시정지"]')).not.toBeNull();
    await act(async () => { Source.instances[0].emit(snapshot({ ...player, paused: true })); });
    expect(element.querySelector('button[aria-label="재생"]')).not.toBeNull();
  });

  it("deduplicates rapid commands while the authoritative operation is pending", async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetch);
    await render();
    await act(async () => { Source.instances[0].emit(snapshot()); });
    const pause = element.querySelector<HTMLButtonElement>('button[aria-label="일시정지"]')!;
    await act(async () => { pause.click(); pause.click(); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(pause.disabled).toBe(true);
    await act(async () => { resolve(Response.json({ ok: true })); });
    expect(pause.disabled).toBe(false);
  });

  it("disables controls while reconnecting and restores them after a valid event", async () => {
    await render();
    const source = Source.instances[0];
    await act(async () => { source.emit(snapshot()); source.onerror?.(); });
    expect(element.querySelector<HTMLButtonElement>('button[aria-label="일시정지"]')?.disabled).toBe(true);
    expect(element.textContent).toContain("마지막으로 확인한 재생 정보");
    await act(async () => { source.onopen?.(); });
    expect(element.querySelector<HTMLButtonElement>('button[aria-label="일시정지"]')?.disabled).toBe(true);
    await act(async () => { source.emit(snapshot()); });
    expect(element.querySelector<HTMLButtonElement>('button[aria-label="일시정지"]')?.disabled).toBe(false);
  });
});
