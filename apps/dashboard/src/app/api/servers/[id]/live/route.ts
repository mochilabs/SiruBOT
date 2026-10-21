import { NextResponse } from "next/server";
import type { PlayerStateResponse } from "@sirubot/utils/playerState";
import { playerStateResponseSchema } from "@sirubot/utils/playerState";

import { createGuildApiHandler } from "@/lib/api-handler";
import { fetchDataApi } from "@/lib/data-api";
import { READ_RATE } from "@/lib/rate-limit";

// 스냅샷 계약은 @sirubot/utils에서 단일 정의 — 대시보드 별칭만 유지해요
export type { PlayerStateResponse as LivePlayerState, QueuedTrackSummary as LiveQueueTrack } from "@sirubot/utils/playerState";

interface DataApiLiveResponse {
  player: PlayerStateResponse | null;
  hub: { guilds: number; subscribed: boolean; staleMs: number };
}

/**
 * 라이브 재생 상태 프록시 — data-api `GET /v1/player/:guildId`(AUTH_KEY 인증)를
 * 인가 게이트 뒤에서 대신 호출해요. 읽기 전용 — 제어는 bot RPC로 별도 구현 예정이에요.
 */
export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "live-get",
  handler: async ({ guildId }) => {
    const data = await fetchDataApi<DataApiLiveResponse>(`/v1/player/${guildId}`);
    if (!data) {
      // data-api 미설정/장애 — SWR 폴백이 "라이브 상태 없음" 화면을 그려요.
      return NextResponse.json(
        { error: "라이브 상태를 불러오지 못했어요." },
        { status: 502 },
      );
    }

    // 프록시 응답도 스냅샷 계약으로 검증 — 셰이프가 어긋나면 라이브 없음(502)으로 취급해요.
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
