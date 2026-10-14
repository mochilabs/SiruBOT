// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { Slider } from "./slider";

describe("slider geometry and keyboard", () => {
  it("rounds the fill without clipping the thumb and preserves keyboard changes", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onChange = vi.fn();
    try {
      await act(async () => { root.render(<Slider value={50} label="볼륨" onChange={onChange} />); });
      expect(host.querySelector('[data-slot="slider-range"]')?.classList.contains("rounded-full")).toBe(true);
      expect(host.querySelector('[data-slot="slider-track"]')?.className).not.toContain("overflow-hidden");
      const input = host.querySelector<HTMLInputElement>('input[type="range"]')!;
      expect(input.getAttribute("aria-label")).toBe("볼륨");
      await act(async () => {
        input.focus();
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith(51);
    } finally {
      await act(async () => { root.unmount(); });
      host.remove();
      vi.unstubAllGlobals();
    }
  });
});
