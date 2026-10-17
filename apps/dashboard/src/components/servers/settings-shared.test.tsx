// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hasUnsavedActiveSettings, hasUnsavedSettings, nudgeSaveBar, SaveBar } from "./settings-shared";

vi.mock("next/navigation", () => ({ usePathname: () => "/servers/fixture" }));

afterEach(() => { vi.unstubAllGlobals(); });

describe("floating save actions", () => {
  it("deduplicates pending saves and restores heading focus when its actions disappear", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let resolve!: () => void;
    const onSave = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const render = (dirty: boolean) => <section><h2>설정 패널</h2><SaveBar dirty={dirty} saving={false} onSave={onSave} /></section>;
    await act(async () => { root.render(render(true)); });
    const save = document.querySelector<HTMLButtonElement>('[data-slot="settings-save-island"] button')!;
    save.focus();
    await act(async () => { save.click(); save.click(); });
    expect(onSave).toHaveBeenCalledOnce();
    expect(save.disabled).toBe(true);
    await act(async () => { resolve(); });
    await act(async () => { root.render(render(false)); });
    expect(document.activeElement?.textContent).toBe("설정 패널");
    expect(document.querySelector('[data-slot="settings-save-island"]')).toBeNull();
    await act(async () => { root.unmount(); });
    host.remove();
  });
  it("keeps the panel layout untouched when the island appears (no inline height reservation)", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    // 섬이 실제로 82px라고 흉내 내요 — 섬 높이가 본문 높이로 새지 않아야 해요
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 0, left: 0, right: 760, bottom: 82, width: 760, height: 82, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onSave = vi.fn();
    const render = (dirty: boolean) => <section><h2>설정 패널</h2><SaveBar dirty={dirty} saving={false} active onSave={onSave} /></section>;
    await act(async () => { root.render(render(false)); });
    const anchor = document.querySelector('[data-slot="settings-save-island-anchor"]');
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute("style")).toBeNull();
    await act(async () => { root.render(render(true)); });
    expect(document.querySelector('[data-slot="settings-save-island"]')).not.toBeNull();
    // 섬이 떠도 앵커는 높이를 갖지 않아야 해요 — 설정 패널이 갑자기 커지는 이유였어요
    expect(anchor!.getAttribute("style")).toBeNull();
    await act(async () => { root.unmount(); });
    host.remove();
  });
  it("hides clean forms and keeps inactive drafts registered without exposing their actions", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onSave = vi.fn();
    await act(async () => { root.render(<SaveBar dirty={false} saving={false} onSave={onSave} />); });
    expect(document.querySelector('[data-slot="settings-save-island"]')).toBeNull();
    await act(async () => { root.render(<SaveBar dirty saving={false} active={false} onSave={onSave} />); });
    expect(hasUnsavedSettings()).toBe(true);
    expect(hasUnsavedActiveSettings()).toBe(false);
    expect(document.querySelector('[data-slot="settings-save-island"]')).toBeNull();
    await act(async () => { root.render(<SaveBar dirty saving={false} active onSave={onSave} />); });
    expect(hasUnsavedActiveSettings()).toBe(true);
    const bar = document.querySelector('[data-slot="settings-save-island"]')!;
    expect(host.contains(bar)).toBe(false);
    await act(async () => { bar.querySelector<HTMLButtonElement>("button")!.click(); });
    expect(onSave).toHaveBeenCalledOnce();
    await act(async () => { root.unmount(); });
    expect(hasUnsavedSettings()).toBe(false);
    host.remove();
  });
  it("shakes the visible save island when nudged and stays quiet for hidden bars", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const animate = vi.fn();
    const originalAnimate = Element.prototype.animate;
    Object.assign(Element.prototype, { animate });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onSave = vi.fn();
    await act(async () => { root.render(<SaveBar dirty saving={false} active={false} onSave={onSave} />); });
    await act(async () => { nudgeSaveBar(); });
    expect(animate).not.toHaveBeenCalled();
    await act(async () => { root.render(<SaveBar dirty saving={false} active onSave={onSave} />); });
    await act(async () => { nudgeSaveBar(); });
    expect(animate).toHaveBeenCalledOnce();
    await act(async () => { root.unmount(); });
    await act(async () => { nudgeSaveBar(); });
    expect(animate).toHaveBeenCalledOnce();
    if (originalAnimate) Element.prototype.animate = originalAnimate;
    host.remove();
  });
});
