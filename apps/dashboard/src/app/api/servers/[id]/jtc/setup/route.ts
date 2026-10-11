import { NextResponse } from "next/server";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { requestJtcSetup } from "@/lib/data-api";
import { guardRateLimit, HEAVY_WRITE_RATE, rateKey } from "@/lib/rate-limit";
import { jtcSetupSchema, zodError } from "@/lib/schemas";

/**
 * 임시 음성(JTC) 마커 채널 준비를 봇에 위임해요 — 마커 채널 생성·이동은 Discord 규격상
 * 봇 토큰으로만 가능해요 (유저 OAuth 토큰에는 길드 채널 관리 권한이 없어서 403이 나요).
 * 봇이 tempVoiceService.setupMarkerChannel로 카테고리 검증 → 마커 재사용(이동)·생성 →
 * DB 저장까지 수행하고, 검증 실패는 한국어 안내를 그대로 응답해요 (400/502/503).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = await guardRateLimit(rateKey("jtc-setup", authz.userId, id), HEAVY_WRITE_RATE);
  if (limited) return limited;

  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = jtcSetupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodError(parsed.error) }, { status: 400 });
    }

    const result = await requestJtcSetup(id, authz.userId, parsed.data.categoryId);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "임시 방 마커 채널을 준비하지 못했어요. 잠시 후 다시 시도해 주세요." },
        { status: result.status },
      );
    }

    return NextResponse.json({
      categoryId: parsed.data.categoryId,
      markerChannelId: result.markerChannelId,
    });
  } catch (error) {
    console.error("Failed to set up JTC marker channel:", error);
    return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
  }
}