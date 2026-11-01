// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GUILD_SETTINGS_DEFAULTS, type GuildSettings } from "@/lib/schemas";

const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock("@/hooks/use-guild-settings", () => ({
  useSettingsForm: (_guildId: string, map: (settings: GuildSettings) => unknown) => ({
    form: map({ ...GUILD_SETTINGS_DEFAULTS, crossfadeEnabled: false }),
    isLoading: false, error: null, saving: false, dirty: false,
    patch, submit: vi.fn(), reload: vi.fn(),
  }),
}));
vi.mock("./mixer-info", () => ({ MixerInfoTip: () => null }));
vi.mock("./settings-shared", () => ({
  PanelError: () => null, PanelLoading: () => null, SaveBar: () => null,
  PanelHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

import { MixerSettings } from "./mixer-settings";

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("AutoMix 설정 화면", () => {
  it("기본값과 비활성 조절기를 표시하고 AutoMix 활성화는 크로스페이드와 함께 저장해요", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<MixerSettings guildId="fixture" />); });
      expect(host.textContent).toContain("6%");
      expect(host.textContent).toContain("0.30");
      expect(host.querySelectorAll('[data-slot="slider"][data-disabled]')).toHaveLength(3);
      const autoSwitch = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="switch"]'))
        .find((element) => element.closest("label")?.textContent?.includes("AutoMix"));
      expect(autoSwitch).toBeDefined();
      await act(async () => { autoSwitch?.click(); });
      expect(patch).toHaveBeenCalledWith({ automixEnabled: true, crossfadeEnabled: true });
    } finally {
      await act(async () => { root.unmount(); });
      host.remove();
    }
  });
});
