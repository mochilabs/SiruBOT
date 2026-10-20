import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { forwardDataApiPost } from "@/lib/data-api";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";
import type { ChzzkProfileResponse } from "@/types/social";

const bodySchema = z.object({
  channelId: z.string().trim().min(8).max(64),
});

const FALLBACK = "치지직 채널 정보를 불러오지 못했어요.";

/** 치지직 채널 프로필 — 링크로 붙여넣은 채널 ID의 이름·프로필을 확인할 때 써요. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = await guardRateLimit(
    rateKey("social-chzzk-profile", authz.userId, id),
    READ_RATE,
  );
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const result = await forwardDataApiPost<ChzzkProfileResponse>(
    `/v1/social/chzzk/profile`,
    parsed.data,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message ?? FALLBACK },
      { status: result.message ? result.status : 502 },
    );
  }

  return NextResponse.json(result.data);
}