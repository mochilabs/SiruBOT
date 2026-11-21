// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { internalNavigationTarget } from "./unsaved-navigation-guard";

function click(href: string, init: MouseEventInit & { target?: string; download?: boolean } = {}) {
  const anchor = document.createElement("a");
  anchor.href = href;
  if (init.target) anchor.target = init.target;
  if (init.download) anchor.setAttribute("download", "");
  const inner = document.createElement("span");
  anchor.append(inner);
  document.body.append(anchor);
  let result: string | null = null;
  inner.addEventListener("click", (event) => {
    result = internalNavigationTarget(event, window.location);
  });
  inner.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
  anchor.remove();
  return result;
}

describe("internalNavigationTarget", () => {
  it("returns the path for a same-origin link to another page", () => {
    expect(click(`${window.location.origin}/servers?x=1#a`)).toBe("/servers?x=1#a");
  });

  it("ignores external links, new tabs, modifier clicks, downloads and same-page links", () => {
    expect(click("https://example.com/other")).toBeNull();
    expect(click(`${window.location.origin}/servers`, { target: "_blank" })).toBeNull();
    expect(click(`${window.location.origin}/servers`, { ctrlKey: true })).toBeNull();
    expect(click(`${window.location.origin}/servers`, { download: true })).toBeNull();
    expect(click(`${window.location.origin}${window.location.pathname}?tab=music`)).toBeNull();
  });
});
