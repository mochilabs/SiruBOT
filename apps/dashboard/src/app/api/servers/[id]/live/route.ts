import { NextResponse } from "next/server";
import type { PlayerStateResponse } from "@sirubot/utils/playerState";
import { playerStateResponseSchema } from "@sirubot/utils/playerState";

import { createGuildApiHandler } from "@/lib/api-handler";
import { fetchDataApi } from "@/lib/data-api/client";
import { READ_RATE } from "@/lib/rate-limit";

export type { PlayerStateResponse as LivePlayerState } from "@sirubot/utils/playerState";

interface DataApiLiveResponse {
  player: PlayerStateResponse | null;
  hub: { guilds: number; subscribed: boolean; staleMs: number };
}

export const GET = createGuildApiHandler({
  role: "member",
  rate: READ_RATE,
  key: "live-get",
  handler: async ({ guildId }) => {
    const data = await fetchDataApi<DataApiLiveResponse>(`/v1/player/${guildId}`);
    if (!data) {
      return NextResponse.json(
        { error: "라이브 상태를 불러오지 못했어요." },
        { status: 502 },
      );
    }

    if (data.player) {
      const result = playerStateResponseSchema.safeParse(data.player);
      if (!result.success) {
        return NextResponse.json(
          { error: "라이브 상태 형식이 올바르지 않아요." },
          { status: 502 },
        );
      }
      data.player = result.data;
    }

    return NextResponse.json(data);
  },
});
