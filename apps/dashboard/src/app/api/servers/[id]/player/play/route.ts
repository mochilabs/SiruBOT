import { NextResponse } from "next/server";
import { playerWebPlayUriSchema } from "@sirubot/utils/playerWeb";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { requestPlayerPlay } from "@/lib/data-api/player-web";
import { WRITE_RATE } from "@/lib/rate-limit";

const playSchema = z.object({
  uri: playerWebPlayUriSchema,
});

export const POST = createGuildApiHandler({
  role: "member",
  rate: WRITE_RATE,
  key: "player-play",
  schema: playSchema,
  invalidMessage: "재생할 곡 주소 형식이 올바르지 않아요.",
  handler: async ({ guildId, authz, data }) => {
    const result = await requestPlayerPlay(guildId, authz.userId, data.uri);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "재생을 시작하지 못했어요." }, { status: result.status });
    }

    return NextResponse.json({ ok: true });
  },
});
