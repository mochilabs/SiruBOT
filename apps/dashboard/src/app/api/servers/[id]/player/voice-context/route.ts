import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { fetchPlayerVoiceContext } from "@/lib/data-api/player-web";
import { READ_RATE } from "@/lib/rate-limit";

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
