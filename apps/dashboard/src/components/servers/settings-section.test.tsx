// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsSection } from "./settings-section";

afterEach(() => { vi.unstubAllGlobals(); });

describe("SettingsSection", () => {
  it("toggles aria-expanded and keeps the body mounted while collapsed", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <SettingsSection title="재생" summary="반복 없음">
          <input aria-label="필드" />
        </SettingsSection>,
      );
    });
    const button = host.querySelector("button")!;
    const body = host.querySelector<HTMLElement>(`#${button.getAttribute("aria-controls")}`)!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(body.hidden).toBe(true);
    expect(host.querySelector('[aria-label="필드"]')).not.toBeNull();
    expect(host.textContent).toContain("반복 없음");
    await act(async () => { button.click(); });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(body.hidden).toBe(false);
    await act(async () => { root.unmount(); });
    host.remove();
  });
});
