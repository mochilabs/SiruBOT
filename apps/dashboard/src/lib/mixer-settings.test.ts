import { describe, expect, it } from "vitest";

import { normalizeMixerToggles } from "./mixer-settings";
import { guildSettingsSchema } from "./schemas";

describe("AutoMix 설정", () => {
  it("AutoMix를 켜면 크로스페이드도 켜고 다른 값은 보존해요", () => {
    expect(normalizeMixerToggles({ automixEnabled: true, automixMaxTempoChange: 0.08 }))
      .toEqual({ automixEnabled: true, crossfadeEnabled: true, automixMaxTempoChange: 0.08 });
  });
  it("크로스페이드를 끄면 함께 끄고, AutoMix만 끄면 크로스페이드는 유지해요", () => {
    expect(normalizeMixerToggles({ crossfadeEnabled: false, automixEnabled: true }))
      .toEqual({ crossfadeEnabled: false, automixEnabled: false });
    expect(normalizeMixerToggles({ automixEnabled: false })).toEqual({ automixEnabled: false });
  });
  it.each([-0.01, 0.121, Infinity, NaN])("범위 밖 템포 비율 %s를 거부해요", (value) => {
    expect(guildSettingsSchema.safeParse({ automixMaxTempoChange: value }).success).toBe(false);
  });
  it.each([-0.01, 1.01, Infinity, NaN])("범위 밖 신뢰도 %s를 거부해요", (value) => {
    expect(guildSettingsSchema.safeParse({ automixMinConfidence: value }).success).toBe(false);
  });
  it.each([0, 0.06, 0.12])("허용 템포 비율 %s를 저장해요", (value) => {
    expect(guildSettingsSchema.parse({ automixMaxTempoChange: value }).automixMaxTempoChange).toBe(value);
  });
});
