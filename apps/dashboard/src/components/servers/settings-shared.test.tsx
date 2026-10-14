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
    host.remove();
  });
});
