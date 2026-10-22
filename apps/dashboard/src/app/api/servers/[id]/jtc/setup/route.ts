import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { requestJtcSetup } from "@/lib/data-api/jtc";
import { HEAVY_WRITE_RATE } from "@/lib/rate-limit";
import { jtcSetupSchema } from "@/lib/schemas";

/**
 * 임시 음성(JTC) 마커 채널 준비를 봇에 위임해요 — 마커 채널 생성·이동은 Discord 규격상
 * 봇 토큰으로만 가능해요 (유저 OAuth 토큰에는 길드 채널 관리 권한이 없어서 403이 나요).
 * 봇이 tempVoiceService.setupMarkerChannel로 카테고리 검증 → 마커 재사용(이동)·생성 →
 * DB 저장까지 수행하고, 검증 실패는 한국어 안내를 그대로 응답해요 (400/502/503).
 */
export const POST = createGuildApiHandler({
  role: "manage",
  rate: HEAVY_WRITE_RATE,
  key: "jtc-setup",
  schema: jtcSetupSchema,
  handler: async ({ guildId, authz, data }) => {
    try {
      const result = await requestJtcSetup(guildId, authz.userId, data.categoryId);
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error ?? "임시 방 마커 채널을 준비하지 못했어요. 잠시 후 다시 시도해 주세요." },
          { status: result.status },
        );
      }

      return NextResponse.json({
        categoryId: data.categoryId,
        markerChannelId: result.markerChannelId,
      });
    } catch (error) {
      console.error("Failed to set up JTC marker channel:", error);
      return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
    }
  },
});
