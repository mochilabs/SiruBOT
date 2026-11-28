import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { requestJtcSetup } from "@/lib/data-api/jtc";
import { HEAVY_WRITE_RATE } from "@/lib/rate-limit";
import { jtcSetupSchema } from "@/lib/schemas";

export const POST = createGuildApiHandler({
  role: "manage",
  rate: HEAVY_WRITE_RATE,
  key: "jtc-setup",
  schema: jtcSetupSchema,
  handler: async ({ guildId, authz, data }) => {
    try {
      const result = await requestJtcSetup(
        guildId,
        authz.userId,
        data.categoryId,
        data.markerChannelName,
      );
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
