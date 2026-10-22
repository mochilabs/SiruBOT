// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ServerSwitcher } from "./server-switcher";
import { SaveBar } from "./settings-shared";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams("tab=music"),
  usePathname: () => "/servers/a",
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated" }) }));
vi.mock("@/hooks/use-session-redirect", () => ({ useSessionExpiredRedirect: () => vi.fn() }));
vi.mock("swr", () => ({ default: () => ({ data: { guilds: [
  { id: "a", name: "현재 서버", icon: null, isManageable: true, isInstalled: true },
  { id: "b", name: "다음 서버", icon: null, isManageable: true, isInstalled: true },
] }, isLoading: false }) }));

afterEach(() => { vi.unstubAllGlobals(); mocks.push.mockReset(); });

describe("server switch confirmation", () => {
  it("requires an explicit discard and preserves the current tab destination", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(<><ServerSwitcher guildId="a" guildName="현재 서버" icon={null} /><SaveBar dirty saving={false} active={false} onSave={() => {}} /></>); });
    const open = async () => {
      await act(async () => { host.querySelector<HTMLButtonElement>('button[aria-label="현재 서버 서버 선택"]')!.click(); });
      await act(async () => { [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.endsWith("다음 서버"))!.click(); });
    };
    await open();
    expect(document.body.textContent).toContain("저장하지 않고 서버를 바꿀까요?");
    expect(mocks.push).not.toHaveBeenCalled();
    await act(async () => { [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "계속 편집")!.click(); });
    expect(mocks.push).not.toHaveBeenCalled();
    await open();
    await act(async () => { [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "변경 사항 버리고 이동")!.click(); });
    expect(mocks.push).toHaveBeenCalledWith("/servers/b?tab=music");
    await act(async () => { root.unmount(); });
    host.remove();
  });
});
