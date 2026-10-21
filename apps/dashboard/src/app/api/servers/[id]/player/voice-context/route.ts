import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { fetchPlayerVoiceContext } from "@/lib/data-api";
import { READ_RATE } from "@/lib/rate-limit";

/**
 * 요청자 음성·권한 상태 — player 페이지의 배지와 재생 UI 활성화에 써요.
 * OAuth로는 사용자의 음성 채널·DJ 권한을 알 수 없으므로 봇이 userId로 해석해 내려줘요.
 */
export const GET = createGuildApiHandler({
  role: "member",
  rate: READ_RATE,
  key: "voice-context",
  handler: async ({ guildId, authz }) => {
    const result = await fetchPlayerVoiceContext(guildId, authz.userId);
    if (!result.ok || !result.voice) {
      return NextResponse.json(
        { error: result.error ?? "음성 상태를 확인하지 못했어요." },
        { status: result.ok ? 502 : result.status },
      );
    }

    return NextResponse.json({ voice: result.voice });
  },
});
