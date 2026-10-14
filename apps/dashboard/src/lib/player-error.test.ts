import { describe, expect, it } from "vitest";

import { playerErrorMessage } from "./player-error";

describe("player error copy", () => {
  it("removes Discord custom emoji syntax while keeping the real error", () => {
    expect(playerErrorMessage("<:error:1558784211224100887> 처리 중 오류가 발생했어요.", "실패"))
      .toBe("처리 중 오류가 발생했어요.");
  });
  it("uses the fallback for empty emoji-only messages", () => {
    expect(playerErrorMessage("<a:error:1558784211224100887>", "재생하지 못했어요."))
      .toBe("재생하지 못했어요.");
  });
});
