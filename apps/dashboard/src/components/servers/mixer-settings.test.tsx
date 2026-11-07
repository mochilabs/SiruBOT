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
  it("꺼짐 상태에서는 조절기를 숨기고 AutoMix 활성화는 크로스페이드와 함께 저장해요", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<MixerSettings guildId="fixture" />); });
      // 전환 방식이 꺼짐이면 길이·AutoMix 조절기는 아예 그리지 않아요
      expect(host.querySelector('[aria-label="겹치기 길이"]')).toBeNull();
      expect(host.querySelector('[aria-label="최대 템포 변경"]')).toBeNull();
      const modeSelect = host.querySelector<HTMLButtonElement>('[aria-label="곡 전환 방식"]');
      expect(modeSelect).toBeDefined();
      await act(async () => { modeSelect?.click(); });
      const autoOption = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((element) => element.textContent === 'AutoMix');
      expect(autoOption).toBeDefined();
      await act(async () => { autoOption?.click(); });
      expect(patch).toHaveBeenCalledWith({ automixEnabled: true, crossfadeEnabled: true });
    } finally {
      await act(async () => { root.unmount(); });
      host.remove();
    }
  });
});
