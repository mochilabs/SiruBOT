import { describe, expect, it } from "vitest";

import { playerErrorMessage } from "./player-error";

describe("player error copy", () => {
  it("keeps the real error message", () => {
    expect(playerErrorMessage(" 다른 음성 채널(음악방)에서 재생 중이에요. ", "실패"))
      .toBe("다른 음성 채널(음악방)에서 재생 중이에요.");
  });
  it("uses the fallback for empty messages", () => {
    expect(playerErrorMessage("  ", "재생하지 못했어요.")).toBe("재생하지 못했어요.");
    expect(playerErrorMessage(null, "재생하지 못했어요.")).toBe("재생하지 못했어요.");
  });
});
